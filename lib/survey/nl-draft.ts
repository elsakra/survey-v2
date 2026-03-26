import OpenAI from "openai";
import { z } from "zod";
import type { CampaignPillarsJson } from "@/lib/vapi";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/** Thrown when the model output fails completeness checks; API maps to 400. */
export class DraftIncompleteError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const msg =
      issues.length > 0
        ? `Draft incomplete: ${issues.join("; ")}`
        : "Draft incomplete. Try again.";
    super(msg);
    this.name = "DraftIncompleteError";
    this.issues = issues;
  }
}

function optString(): z.ZodType<string | undefined> {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? undefined : v));
}

const llmPillarSchema = z.object({
  question: z.preprocess((v) => (v == null ? "" : String(v)), z.string()),
  context: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
});

const llmOutputSchema = z.object({
  title: optString(),
  context: optString(),
  pillars: z.array(llmPillarSchema).default([]),
  instructions: optString(),
  max_duration_sec: z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().optional()),
  opening_sentence: optString(),
  interviewer_name: optString(),
  org_name: optString(),
  tone_style: optString(),
});

export type AiDraftCurrentInput = {
  title: string;
  context: string;
  instructions: string;
  max_duration_sec: number;
  opening_sentence: string;
  interviewer_name: string;
  org_name: string;
  tone_style: string;
  pillars: Array<{ question: string; context: string }>;
};

export type NormalizedAiDraft = {
  title: string;
  context: string;
  instructions: string;
  max_duration_sec: number;
  opening_sentence: string;
  interviewer_name: string;
  org_name: string;
  tone_style: string;
  pillars: Array<{ id: string; question: string; context: string }>;
  pillars_json: CampaignPillarsJson;
};

const MIN_RESEARCH_CONTEXT_LEN = 100;
const MIN_INSTRUCTIONS_LEN = 80;
const MIN_PILLAR_CONTEXT_LEN = 50;
const MIN_OPENING_LEN = 60;

const METHODOLOGY_SYSTEM = `You are an expert qualitative research designer for short PHONE interviews run by an AI voice agent (semi-structured depth style).

The runtime enforces: consent flow; at most ONE question per assistant turn; short replies; neutral non-leading wording; no evaluative praise; adaptive follow-ups. Design pillars and copy that fit those constraints.

METHODOLOGY (encode in your output):
- Question types: Default to a single primary ask per pillar that is open, narrative, or behavioral ("walk me through…", "what happened when…", "how does that typically play out…"). Prefer past/concrete over abstract hypotheticals at the start of a topic.
- Scales: Use a numeric scale (1–5, 1–10, etc.) in the pillar question text ONLY when the user's brief calls for measurement (satisfaction, effort, likelihood, agreement). At most one scale-style pillar; embed the exact scale wording in that pillar question.
- Ordering (funnel): Order pillars from lower-threat / context-setting → core discovery → more sensitive or evaluative topics last (unless the user requests otherwise).
- Neutrality: No double-barreled questions. No "Don't you think…", no blame, no assumed facts about the participant. Avoid unexplained jargon; use plain language for the audience.
- Per-pillar "context": REQUIRED for every pillar. Internal only—not read aloud. Include (1) learning goal, (2) what strong evidence looks like (specific incidents, frequency, triggers, tradeoffs).
- Research "context" (top-level string): REQUIRED—2–5 sentences: study purpose, audience/population, topic domain, sensitivity level, and that responses are confidential.
- "instructions": REQUIRED—2–4 short bullet lines as a single string (use newline between bullets). Include: prioritize concrete stories over vague opinions; if time runs short, which pillars to shorten or skip last; do not collect unnecessary PII; any out-of-scope topics.
- "title": REQUIRED—concise study name.
- "opening_sentence": REQUIRED—first words the interviewer speaks: brief intro, who you represent (org_name), confidential short research call, recording if applicable, time roughly consistent with max_duration_sec, ask if now is okay. No pillar content.
- "org_name": REQUIRED—credible neutral label (e.g. "the research team", "our product research group", or the named org from the brief). Never empty.
- "tone_style": REQUIRED—one short phrase calibrated to the population (e.g. executives: "crisp, neutral, professional, concise"; students: "casual, warm, non-jargony, concise"; sensitive topics: "calm, empathetic, plain-spoken, concise").
- "max_duration_sec": REQUIRED integer 120–1800. Use ~120 seconds of substantive interview time per pillar as a baseline (e.g. 4 pillars → about 480s), increase slightly for especially deep exploratory briefs, decrease only for explicitly "very quick" asks. Align the minutes you mention in opening_sentence with this budget (the agent rounds to whole minutes).

Output strictly JSON with keys: title, context, pillars (array of { question, context } — context required), instructions, max_duration_sec, opening_sentence, interviewer_name (optional), org_name, tone_style.

Use null only where a key is truly absent; never omit required keys.`;

function getModel(): string {
  return process.env.LLM_MODEL ?? "gpt-4o-mini";
}

function parseLlmJson(raw: string): z.infer<typeof llmOutputSchema> {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("The model returned invalid JSON. Try again.");
  }
  const result = llmOutputSchema.safeParse(data);
  if (!result.success) {
    throw new Error("The model returned an invalid draft. Try again.");
  }
  return result.data;
}

function defaultDurationSecForPillarCount(n: number): number {
  const baseline = Math.round(Math.max(300, n * 120));
  return Math.min(1800, Math.max(120, baseline));
}

function deriveTitleFallback(userPrompt: string | undefined, firstPillarQuestion: string): string {
  const fromPrompt = (userPrompt ?? "").trim().split(/\n+/)[0]?.trim().slice(0, 72);
  if (fromPrompt && fromPrompt.length >= 8) {
    return fromPrompt.replace(/\s+/g, " ");
  }
  const fromPillar = firstPillarQuestion.trim().slice(0, 72);
  if (fromPillar.length >= 8) {
    return fromPillar.replace(/\s+/g, " ");
  }
  return "Research interview";
}

export function normalizeLlmDraft(
  raw: z.infer<typeof llmOutputSchema>,
  opts?: { userPrompt?: string },
): NormalizedAiDraft {
  const pillars = raw.pillars
    .map((p) => ({
      question: (p.question ?? "").trim(),
      context: (p.context ?? "").trim(),
    }))
    .filter((p) => p.question.length > 0)
    .slice(0, 5);

  if (pillars.length === 0) {
    throw new Error("Draft must include at least one pillar with a non-empty question.");
  }

  let maxDuration =
    raw.max_duration_sec != null
      ? Math.round(raw.max_duration_sec)
      : defaultDurationSecForPillarCount(pillars.length);
  maxDuration = Math.min(1800, Math.max(120, maxDuration));

  let title = (raw.title ?? "").trim();
  if (!title) {
    title = deriveTitleFallback(opts?.userPrompt, pillars[0]?.question ?? "");
  }

  let context = (raw.context ?? "").trim();
  let instructions = (raw.instructions ?? "").trim();
  let openingSentence = (raw.opening_sentence ?? "").trim();
  const interviewerName = (raw.interviewer_name ?? "Sarah").trim() || "Sarah";
  let orgName = (raw.org_name ?? "").trim();
  if (!orgName) {
    orgName = "the research team";
  }
  const toneStyle =
    (raw.tone_style ?? "").trim() || "warm, neutral, professional, concise";

  const withIds = pillars.map((p, i) => ({
    id: `p${i + 1}`,
    question: p.question,
    context: p.context,
  }));

  const pillarsJson: CampaignPillarsJson = {
    ...(title ? { title } : {}),
    ...(context ? { context } : {}),
    ...(interviewerName ? { interviewer_name: interviewerName } : {}),
    ...(orgName ? { org_name: orgName } : {}),
    pillars: withIds.map((p) => ({
      id: p.id,
      question: p.question,
      ...(p.context ? { context: p.context } : {}),
    })),
    tone: { style: toneStyle },
    constraints: { prefer_quantification: true },
  };

  return {
    title,
    context,
    instructions,
    max_duration_sec: maxDuration,
    opening_sentence: openingSentence,
    interviewer_name: interviewerName,
    org_name: orgName,
    tone_style: toneStyle,
    pillars: withIds,
    pillars_json: pillarsJson,
  };
}

function validateNormalizedDraft(d: NormalizedAiDraft): void {
  const issues: string[] = [];

  if (d.context.length < MIN_RESEARCH_CONTEXT_LEN) {
    issues.push(
      `research context must be at least ${MIN_RESEARCH_CONTEXT_LEN} characters`,
    );
  }
  if (d.instructions.length < MIN_INSTRUCTIONS_LEN) {
    issues.push(
      `instructions must be at least ${MIN_INSTRUCTIONS_LEN} characters (include bullet-style priorities)`,
    );
  }
  if (d.opening_sentence.length < MIN_OPENING_LEN) {
    issues.push(
      `opening_sentence must be at least ${MIN_OPENING_LEN} characters`,
    );
  }
  if (!d.org_name.trim()) {
    issues.push("org_name is required");
  }

  d.pillars.forEach((p, i) => {
    if (p.context.length < MIN_PILLAR_CONTEXT_LEN) {
      issues.push(
        `pillar ${i + 1} learning goal (context) must be at least ${MIN_PILLAR_CONTEXT_LEN} characters`,
      );
    }
  });

  if (issues.length > 0) {
    throw new DraftIncompleteError(issues);
  }
}

function finalizeDraft(
  raw: z.infer<typeof llmOutputSchema>,
  opts?: { userPrompt?: string },
): NormalizedAiDraft {
  const draft = normalizeLlmDraft(raw, opts);
  validateNormalizedDraft(draft);
  return draft;
}

async function completeJsonObject(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
): Promise<string> {
  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages,
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI");
  return raw;
}

async function runWithOptionalRepair(args: {
  client: OpenAI;
  initialMessages: ChatCompletionMessageParam[];
  repairPreamble: string;
  userPromptForFallback: string;
}): Promise<NormalizedAiDraft> {
  let lastIssues: string[] | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: ChatCompletionMessageParam[] =
      attempt === 0
        ? args.initialMessages
        : [
            { role: "system", content: METHODOLOGY_SYSTEM },
            {
              role: "user",
              content:
                `${args.repairPreamble}\n\nValidation errors from the previous JSON:\n${lastIssues!.map((s) => `- ${s}`).join("\n")}\n\nReturn the COMPLETE corrected JSON with every required field satisfied. Same keys as specified in the system message.\n\n${args.userPromptForFallback}`,
            },
          ];

    const raw = await completeJsonObject(args.client, messages);
    const parsed = parseLlmJson(raw);
    try {
      return finalizeDraft(parsed, { userPrompt: args.userPromptForFallback });
    } catch (e) {
      if (e instanceof DraftIncompleteError) {
        lastIssues = e.issues;
        if (attempt === 1) throw e;
        continue;
      }
      throw e;
    }
  }

  throw new Error("Draft generation failed after retry.");
}

export async function generateDraftFromPrompt(userPrompt: string): Promise<NormalizedAiDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });
  const trimmed = userPrompt.trim();

  return runWithOptionalRepair({
    client,
    userPromptForFallback: trimmed,
    initialMessages: [
      { role: "system", content: METHODOLOGY_SYSTEM },
      { role: "user", content: `Design an interview from this brief:\n\n${trimmed}` },
    ],
    repairPreamble: "Your previous answer failed validation.",
  });
}

export async function reviseDraft(
  current: AiDraftCurrentInput,
  userPrompt: string,
): Promise<NormalizedAiDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });
  const trimmed = userPrompt.trim();

  const snapshot: Record<string, unknown> = {
    title: current.title,
    context: current.context,
    instructions: current.instructions,
    max_duration_sec: current.max_duration_sec,
    opening_sentence: current.opening_sentence,
    interviewer_name: current.interviewer_name,
    org_name: current.org_name,
    tone_style: current.tone_style,
    pillars: current.pillars.map((p) => ({
      question: p.question,
      context: p.context || undefined,
    })),
  };

  const reviseBlock =
    `Here is the current interview draft as JSON:\n${JSON.stringify(snapshot, null, 2)}\n\n` +
    `Apply the following changes and return the FULL updated draft as JSON (same keys as when creating from scratch). Preserve parts that the user did not ask to change.\n\n${trimmed}`;

  return runWithOptionalRepair({
    client,
    userPromptForFallback: reviseBlock,
    initialMessages: [{ role: "system", content: METHODOLOGY_SYSTEM }, { role: "user", content: reviseBlock }],
    repairPreamble: "Your previous revised JSON failed validation.",
  });
}
