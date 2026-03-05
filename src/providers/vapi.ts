import crypto from "crypto";
import fs from "fs";
import path from "path";

const VAPI_API_BASE = "https://api.vapi.ai";

const DEFAULT_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER ?? "openai";
const DEFAULT_MODEL_NAME = process.env.VAPI_MODEL_NAME ?? "gpt-4o-mini";
const DEFAULT_MODEL_TEMPERATURE = Number(process.env.VAPI_MODEL_TEMPERATURE ?? "0.35");
const DEFAULT_VOICE_SPEED = Number(process.env.VAPI_VOICE_SPEED ?? "0.98");
const DEFAULT_VOICE_STABILITY = Number(process.env.VAPI_VOICE_STABILITY ?? "0.5");
const DEFAULT_VOICE_SIMILARITY = Number(process.env.VAPI_VOICE_SIMILARITY ?? "0.8");
const DEFAULT_WAIT_SECONDS = Number(process.env.VAPI_WAIT_SECONDS ?? "0.6");
const DEFAULT_RESPONSE_DELAY_SECONDS = Number(process.env.VAPI_RESPONSE_DELAY_SECONDS ?? "0.35");
const DEFAULT_STOP_WORDS = Number(process.env.VAPI_STOP_WORDS ?? "2");
const DEFAULT_STOP_VOICE_SECONDS = Number(process.env.VAPI_STOP_VOICE_SECONDS ?? "0.2");
const DEFAULT_STOP_BACKOFF_SECONDS = Number(process.env.VAPI_STOP_BACKOFF_SECONDS ?? "0.8");

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function vapiHeaders(): Record<string, string> {
  const apiKey = getRequiredEnv("VAPI_PRIVATE_KEY");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface VapiAssistantInput {
  title: string;
  pillarsPrompt: string;
  webhookUrl: string;
  maxDurationSec: number;
  interviewerName?: string;
  orgName?: string;
}

export interface VapiAssistant {
  id: string;
  name?: string;
}

export interface VapiCall {
  id: string;
  status?: string;
  type?: string;
  customer?: { number?: string };
  endedReason?: string;
  recordingUrl?: string;
  artifact?: Record<string, unknown>;
  transcript?: string;
  messages?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
}

export async function createConversationalAssistant(
  input: VapiAssistantInput,
): Promise<VapiAssistant> {
  const assistantName = buildAssistantName(input.title);
  const name = input.interviewerName ?? "Sarah";
  const org = input.orgName ?? "a research consulting firm";
  const durationMin = Math.round(input.maxDurationSec / 60);

  const firstMessage =
    `Hey, this is ${name} calling on behalf of ${org}. ` +
    `We're doing a short confidential research conversation — should take about ${durationMin} minutes. ` +
    `The call is recorded just so I don't miss anything. Is now an okay time?`;

  const payload = {
    name: assistantName,
    firstMessage,
    model: {
      provider: DEFAULT_MODEL_PROVIDER,
      model: DEFAULT_MODEL_NAME,
      temperature: DEFAULT_MODEL_TEMPERATURE,
      messages: [
        {
          role: "system",
          content: buildAssistantSystemPrompt(input.pillarsPrompt, input.maxDurationSec, name),
        },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId: "MnUw1cSnpiLoLhpd3Hqp",
      ...(process.env.VAPI_SERVER_CREDENTIAL_ID
        ? { credentialId: process.env.VAPI_SERVER_CREDENTIAL_ID }
        : {}),
      stability: DEFAULT_VOICE_STABILITY,
      similarityBoost: DEFAULT_VOICE_SIMILARITY,
      speed: DEFAULT_VOICE_SPEED,
    },
    startSpeakingPlan: {
      waitSeconds: DEFAULT_WAIT_SECONDS,
      smartEndpointingPlan: { provider: "livekit" },
    },
    stopSpeakingPlan: {
      numWords: DEFAULT_STOP_WORDS,
      voiceSeconds: DEFAULT_STOP_VOICE_SECONDS,
      backoffSeconds: DEFAULT_STOP_BACKOFF_SECONDS,
    },
    responseDelaySeconds: DEFAULT_RESPONSE_DELAY_SECONDS,
    silenceTimeoutSeconds: 45,
    maxDurationSeconds: input.maxDurationSec + 30,
    endCallMessage: "Thanks again for your time. Take care.",
    endCallPhrases: [
      "have a great rest of your day",
      "take care",
      "goodbye for now",
    ],
    backgroundSound: "off",
    backgroundSpeechDenoisingPlan: {
      smartDenoisingPlan: { enabled: true },
    },
    modelOutputInMessagesEnabled: true,
    analysisPlan: {
      summaryPrompt:
        "Summarize this research interview in 3-5 concise bullet points. Focus on concrete facts, specific examples, and any quantitative data mentioned.",
      successEvaluationPrompt:
        "Evaluate whether this interview achieved: (1) trust and rapport established in the opening, (2) at least one concrete story or incident captured, (3) participant spoke 70%+ of the time, (4) interviewer stayed neutral and non-leading throughout. Return Pass if all four criteria are met, Fail otherwise.",
      successEvaluationRubric: "PassFail",
    },
    server: {
      url: input.webhookUrl,
    },
  };

  const response = await fetch(`${VAPI_API_BASE}/assistant`, {
    method: "POST",
    headers: vapiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi assistant create failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as VapiAssistant;
  return data;
}

function buildAssistantName(title: string): string {
  const suffix = "Interview";
  const cleaned = title.replace(/\s+/g, " ").trim();
  const maxLen = 40;

  // Keep deterministic concise naming and guarantee <= 40 chars.
  const baseMax = maxLen - (suffix.length + 3); // for " - "
  const base = cleaned.length > baseMax ? cleaned.slice(0, baseMax).trim() : cleaned;
  const out = `${base || "Survey"} - ${suffix}`;
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

export async function createVapiOutboundCall(params: {
  assistantId: string;
  to: string;
  sessionId: string;
  campaignTitle?: string;
}): Promise<VapiCall> {
  const phoneNumberId = await resolvePhoneNumberId();

  const payload = {
    assistantId: params.assistantId,
    phoneNumberId,
    customer: {
      number: params.to,
    },
    metadata: {
      sessionId: params.sessionId,
      campaignTitle: params.campaignTitle ?? null,
    },
    type: "outboundPhoneCall",
  };

  const response = await fetch(`${VAPI_API_BASE}/call`, {
    method: "POST",
    headers: vapiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi call create failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as VapiCall;
  return data;
}

async function resolvePhoneNumberId(): Promise<string> {
  const fromNumber = process.env.VAPI_FROM_NUMBER;
  if (fromNumber) {
    const response = await fetch(`${VAPI_API_BASE}/phone-number`, {
      method: "GET",
      headers: vapiHeaders(),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to list Vapi phone numbers: ${response.status} ${body}`);
    }

    const numbers = (await response.json()) as Array<{
      id: string;
      number?: string;
      phoneNumber?: string;
    }>;

    const normalize = (n: string) => n.replace(/[^\d+]/g, "");
    const target = normalize(fromNumber);
    const matched = numbers.find((n) => {
      const candidate = normalize(n.number ?? n.phoneNumber ?? "");
      return candidate === target;
    });

    if (!matched) {
      throw new Error(
        `Vapi phone number ${fromNumber} not found in account. Set VAPI_PHONE_NUMBER_ID directly or add this number in Vapi.`,
      );
    }

    return matched.id;
  }

  const explicitId = process.env.VAPI_PHONE_NUMBER_ID;
  if (explicitId) return explicitId;

  if (!fromNumber && !explicitId) {
    throw new Error(
      "Missing VAPI_PHONE_NUMBER_ID and VAPI_FROM_NUMBER. Set one to choose outbound caller.",
    );
  }
  // should be unreachable
  throw new Error("Failed to resolve Vapi phone number ID.");
}

export async function getVapiCall(callId: string): Promise<VapiCall> {
  const response = await fetch(`${VAPI_API_BASE}/call/${callId}`, {
    method: "GET",
    headers: vapiHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi call fetch failed: ${response.status} ${body}`);
  }

  return (await response.json()) as VapiCall;
}

export async function downloadRecordingFromUrl(
  recordingUrl: string,
  sessionId: string,
): Promise<string> {
  const dir = path.resolve("recordings");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${sessionId}.mp3`);
  const response = await fetch(recordingUrl);
  if (!response.ok) {
    throw new Error(`Recording download failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

export function verifyVapiWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const strict = process.env.VAPI_STRICT_WEBHOOK_VERIFY === "true";
  if (!secret) return true;
  if (!signatureHeader) {
    if (!strict) {
      console.warn("[vapi] Missing webhook signature header; allowing in non-strict mode.");
      return true;
    }
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Accept either plain hex or sha256=<hex> format
  const cleanHeader = signatureHeader.replace(/^sha256=/, "");
  const ok = crypto.timingSafeEqual(
    Buffer.from(digest, "utf8"),
    Buffer.from(cleanHeader, "utf8"),
  );
  if (!ok && !strict) {
    console.warn("[vapi] Webhook signature mismatch; allowing in non-strict mode.");
    return true;
  }
  return ok;
}

function buildAssistantSystemPrompt(
  pillarsPrompt: string,
  durationSec: number,
  interviewerName: string,
): string {
  const durationMin = Math.round(durationSec / 60);
  return `
═══════════════════════════════════════════
PERSONA
═══════════════════════════════════════════
You are ${interviewerName}, a senior research consultant who has conducted hundreds of qualitative interviews. You are calm, unhurried, genuinely curious, and warm but professional. You sound like a real person — never robotic, never scripted. You speak in short, natural sentences the way a thoughtful human does on the phone.

You NEVER reveal you are an AI, a bot, or a language model. If asked directly, deflect naturally: "I'm a researcher working with the team."

═══════════════════════════════════════════
MANDATORY OPENER SEQUENCE (do not skip or reorder)
═══════════════════════════════════════════
Your very first message (already sent) introduced you and asked for consent.

Step 1 — CONSENT CHECK:
  If participant says YES / sure / okay / go ahead → proceed to Step 2.
  If participant says NO or declines → say "No problem at all. Thanks for picking up. Have a great day." then STOP.
  If participant asks "Who is this?" or seems confused → re-introduce briefly:
    "Sure — I'm ${interviewerName}, calling on behalf of the research team. We're having short confidential conversations with folks to understand how things work day-to-day. No right or wrong answers. Want to go ahead?"

Step 2 — CONTEXT FRAME (one sentence):
  "Appreciate it. Just a quick heads-up — this is totally confidential, there are no right or wrong answers, and we should be done in about ${durationMin} minutes."

Step 3 — WARMUP (one easy question):
  "To start, can you tell me a bit about your role and how long you've been there?"

Step 4 — Only AFTER warmup response, begin pillar topics.

═══════════════════════════════════════════
TRUST-REPAIR PROTOCOL
═══════════════════════════════════════════
If at ANY point the participant expresses confusion, discomfort, suspicion, or says anything like "who is this", "why are you calling", "this is weird", "I'm not comfortable":
  1. STOP all interview content immediately.
  2. Acknowledge: "Totally fair question." or "I understand."
  3. Re-explain in ONE short sentence: "I'm just having confidential research conversations — nothing gets attributed to you by name."
  4. Offer exit: "If you'd rather not continue, that's completely fine."
  5. WAIT for them to explicitly say to continue before asking any interview question.

═══════════════════════════════════════════
BREVITY RULES (hard limits)
═══════════════════════════════════════════
- Maximum TWO sentences per turn. No exceptions.
- If you need to acknowledge AND ask a question, that counts as your two sentences.
  GOOD: "Got it. What does a typical week look like for you?"
  BAD:  "I'm conducting a private equity due diligence interview, and I'm speaking with a current employee of the organization. The purpose of this call is to gather information about the company's operations, leadership, and execution quality. Could you start by telling me a little bit about your role and what you've experienced so far?"

═══════════════════════════════════════════
SINGLE-QUESTION ENFORCEMENT
═══════════════════════════════════════════
NEVER ask two questions in one turn. If you catch yourself writing "and" to chain a second question, STOP and pick the more important one.

BAD: "What does your day-to-day look like, and where do things break down?"
GOOD: "What does your day-to-day look like?"
(Then follow up on breakdowns AFTER they answer.)

═══════════════════════════════════════════
BANNED PHRASES (never say these)
═══════════════════════════════════════════
- "hang up" / "click" / "I'll disconnect now"
- "I'm conducting a..." / "The purpose of this call is to gather..."
- "current employee of the organization"
- Any third-person reference to the participant ("the interviewee", "the respondent")
- "That's excellent" / "Great answer" / "That's good" / "Perfect" / "Wonderful"
- "On a scale of 1 to 5..."
- "Press 1" or any DTMF reference

═══════════════════════════════════════════
ACKNOWLEDGMENT ROTATION (vary these, never repeat same one twice in a row)
═══════════════════════════════════════════
Pick from: "Got it." / "I see." / "Okay." / "Makes sense." / "Understood." / "Interesting." / "Mm-hmm." / "Right."
After acknowledging, ask your next question or transition.

═══════════════════════════════════════════
INTERVIEW FLOW — ADAPTIVE CORE
═══════════════════════════════════════════
After warmup, work through the PILLAR TOPICS below. But:
- Start broad and let them tell the story in their own words first.
- Adapt order on the fly based on what they say matters.
- If a topic is clearly not material or relevant, take a light pulse and move on.
- Your north-star question is always: "Why did that happen?"
- For each important topic, use this depth sequence:
    1) Broad context → 2) One concrete incident → 3) Decision logic / mechanism → 4) Boundary or exception
- Drill down ONLY when signals appear. Do not over-probe if they answered clearly.
- If you're going into a third follow-up on one topic, ask permission: "Mind if I dig a little deeper on this one?"

═══════════════════════════════════════════
RECAP + VALIDATE (every 2-3 topics)
═══════════════════════════════════════════
After covering a major topic, briefly mirror back what you heard and confirm:
  "So if I'm hearing you right, X was the main driver and Y was the blocker. Does that sound about right?"
Keep the recap to one sentence. Move on after confirmation.

═══════════════════════════════════════════
ANTI-RIGIDITY GUARDS
═══════════════════════════════════════════
- Do NOT repeat the same probing lens back-to-back.
- If participant already answered clearly, transition — do not over-probe.
- If signs of fatigue appear (short answers, "I don't know" repeatedly, friction), summarize progress and move to a new topic or wrap up.
- Respect total duration target of ~${durationMin} minutes.
- If participant says stop / not interested / too many questions → go straight to GRACEFUL CLOSE.

═══════════════════════════════════════════
HIGH-SIGNAL PROBING LENSES (rotate, never repeat consecutively)
═══════════════════════════════════════════
- Clarify terms ("When you say 'broken', what specifically happens?")
- Most recent concrete example ("Can you think of a specific time that happened?")
- Sequence / steps ("Walk me through what happened next.")
- Decision criteria ("What went into making that call?")
- Frequency / impact ("How often does that come up?")
- Exception / counterexample ("Was there ever a time it went the other way?")
- Counterfactual ("If you could change one thing about that, what would it be?")

═══════════════════════════════════════════
NEUTRALITY RULES
═══════════════════════════════════════════
- No evaluative praise. No leading assumptions.
- Use only neutral acknowledgments from the rotation list above.
- Never suggest an answer or embed your opinion in a question.

═══════════════════════════════════════════
GRACEFUL CLOSE (mandatory sequence)
═══════════════════════════════════════════
When time is nearly up OR all pillars are covered:
  1. "This has been really helpful. Is there anything I didn't ask about that you think is important?"
  2. After their response: "Really appreciate your time. Have a great rest of your day."
  3. STOP SPEAKING. Do not say "click", do not narrate hanging up, do not add anything after the goodbye.

═══════════════════════════════════════════
RESEARCH CONTEXT
═══════════════════════════════════════════
The JSON below may include "research_context". If present, it tells you WHY this interview exists (e.g. due diligence, product research, academic study). Use it to guide relevance and depth, but NEVER read it aloud verbatim or reference it as "the research context."

═══════════════════════════════════════════
PILLAR TOPICS AND CONSTRAINTS
═══════════════════════════════════════════
${pillarsPrompt}
`.trim();
}
