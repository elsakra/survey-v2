import OpenAI from "openai";
import { z } from "zod";
import type { CampaignPillarsJson } from "@/lib/vapi";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

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

const METHODOLOGY_SYSTEM = `You are an expert qualitative research designer for short phone interviews conducted by an AI voice agent.

The interviewer runtime already enforces: consent flow, at most ONE question per assistant turn, short replies, neutral non-leading wording, no praise like "great answer", and adaptive follow-ups. Your job is to produce pillar content that fits those rules.

Rules for pillar questions:
- Each pillar has ONE primary open-ended question (one sentence). No compound questions ("and also…"). No stacking two asks in one pillar.
- Wording must be neutral and non-leading. No assumptions about what the participant did or felt.
- Optional per-pillar "context" is an internal learning goal for the interviewer (what insight to seek), not text to read aloud.
- Prefer 3–5 pillars unless the user explicitly wants fewer or you have a strong reason for 2. Never more than 5 pillars.
- If the user wants a numeric scale (1–5, 1–10), put the exact scale in the pillar question text; the agent will follow scale follow-up rules automatically.

Opening sentence:
- If you output opening_sentence, it must be the first thing the interviewer says: brief intro, organization, confidential short research call, optional recording mention, and ask if now is okay — matching a natural consent ask. Do not include pillar content.

Tone:
- tone_style is a short phrase for the agent (e.g. "warm, neutral, professional, concise" or "casual, concise, non-jargony" for students).

Duration:
- max_duration_sec: aim for ~90 seconds of interview time per pillar minimum (e.g. 4 pillars → ~360–480), capped 120–1800, unless the user specifies length.

Output strictly JSON with keys: title, context, pillars (array of { question, context? }), instructions (optional), max_duration_sec (optional), opening_sentence (optional), interviewer_name (optional), org_name (optional), tone_style (optional). Use null or omit for unknown optional strings.`;

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

export function normalizeLlmDraft(
  raw: z.infer<typeof llmOutputSchema>,
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

  let maxDuration = raw.max_duration_sec ?? Math.min(1800, Math.max(120, pillars.length * 90));
  maxDuration = Math.round(maxDuration);
  maxDuration = Math.min(1800, Math.max(120, maxDuration));

  const title = (raw.title ?? "").trim();
  const context = (raw.context ?? "").trim();
  const instructions = (raw.instructions ?? "").trim();
  const openingSentence = (raw.opening_sentence ?? "").trim();
  const interviewerName = (raw.interviewer_name ?? "Sarah").trim() || "Sarah";
  const orgName = (raw.org_name ?? "").trim();
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

export async function generateDraftFromPrompt(userPrompt: string): Promise<NormalizedAiDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });
  const raw = await completeJsonObject(client, [
    { role: "system", content: METHODOLOGY_SYSTEM },
    {
      role: "user",
      content: `Design an interview from this brief:\n\n${userPrompt.trim()}`,
    },
  ]);
  const parsed = parseLlmJson(raw);
  return normalizeLlmDraft(parsed);
}

export async function reviseDraft(
  current: AiDraftCurrentInput,
  userPrompt: string,
): Promise<NormalizedAiDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });
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

  const raw = await completeJsonObject(client, [
    { role: "system", content: METHODOLOGY_SYSTEM },
    {
      role: "user",
      content:
        `Here is the current interview draft as JSON:\n${JSON.stringify(snapshot, null, 2)}\n\n` +
        `Apply the following changes and return the FULL updated draft as JSON (same keys as when creating from scratch). Preserve parts that the user did not ask to change.\n\n${userPrompt.trim()}`,
    },
  ]);
  const parsed = parseLlmJson(raw);
  return normalizeLlmDraft(parsed);
}
