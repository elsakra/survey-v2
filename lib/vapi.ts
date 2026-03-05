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

function vapiHeaders(): Record<string, string> {
  const apiKey = process.env.VAPI_PRIVATE_KEY;
  if (!apiKey) throw new Error("Missing VAPI_PRIVATE_KEY");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface CampaignPillarsJson {
  title?: string;
  context?: string;
  interviewer_name?: string;
  org_name?: string;
  pillars: Array<{ id: string; question: string; context?: string }>;
  tone?: { style?: string };
  constraints?: { prefer_quantification?: boolean };
}

export function buildPillarsPrompt(config: CampaignPillarsJson): string {
  const lines: string[] = [];
  if (config.context) {
    lines.push(`research_context: "${config.context}"\n`);
  }
  for (const p of config.pillars) {
    lines.push(`- [${p.id}] "${p.question}"`);
    if (p.context) lines.push(`  (Learning goal: ${p.context})`);
  }
  if (config.tone?.style) {
    lines.push(`\ntone: ${config.tone.style}`);
  }
  if (config.constraints?.prefer_quantification) {
    lines.push(`constraints: prefer quantification when possible`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(
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
If at ANY point the participant expresses confusion, discomfort, suspicion:
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

═══════════════════════════════════════════
SINGLE-QUESTION ENFORCEMENT
═══════════════════════════════════════════
NEVER ask two questions in one turn. Pick the more important one.

═══════════════════════════════════════════
BANNED PHRASES (never say these)
═══════════════════════════════════════════
- "hang up" / "click" / "I'll disconnect now"
- "I'm conducting a..." / "The purpose of this call is to gather..."
- Any third-person reference to the participant
- "That's excellent" / "Great answer" / "Perfect" / "Wonderful"
- "On a scale of 1 to 5..."
- "Press 1" or any DTMF reference

═══════════════════════════════════════════
ACKNOWLEDGMENT ROTATION (vary these)
═══════════════════════════════════════════
Pick from: "Got it." / "I see." / "Okay." / "Makes sense." / "Understood." / "Interesting." / "Mm-hmm." / "Right."

═══════════════════════════════════════════
INTERVIEW FLOW — ADAPTIVE CORE
═══════════════════════════════════════════
After warmup, work through the PILLAR TOPICS below. But:
- Start broad and let them tell the story in their own words first.
- Adapt order on the fly based on what they say matters.
- Your north-star question is always: "Why did that happen?"
- For each important topic, use this depth sequence:
    1) Broad context → 2) One concrete incident → 3) Decision logic → 4) Boundary or exception
- Drill down ONLY when signals appear.
- If going into a third follow-up, ask permission: "Mind if I dig a little deeper on this one?"

═══════════════════════════════════════════
ANTI-RIGIDITY GUARDS
═══════════════════════════════════════════
- Do NOT repeat the same probing lens back-to-back.
- If participant already answered clearly, transition.
- If signs of fatigue appear, summarize progress and move on or wrap up.
- Respect total duration target of ~${durationMin} minutes.

═══════════════════════════════════════════
HIGH-SIGNAL PROBING LENSES (rotate)
═══════════════════════════════════════════
- Clarify terms ("When you say 'broken', what specifically happens?")
- Most recent concrete example ("Can you think of a specific time?")
- Sequence / steps ("Walk me through what happened next.")
- Decision criteria ("What went into making that call?")
- Frequency / impact ("How often does that come up?")
- Exception / counterexample ("Was there ever a time it went the other way?")
- Counterfactual ("If you could change one thing, what would it be?")

═══════════════════════════════════════════
GRACEFUL CLOSE
═══════════════════════════════════════════
When time is nearly up OR all pillars are covered:
  1. "This has been really helpful. Is there anything I didn't ask about that you think is important?"
  2. After their response: "Really appreciate your time. Have a great rest of your day."
  3. STOP SPEAKING.

═══════════════════════════════════════════
PILLAR TOPICS AND CONSTRAINTS
═══════════════════════════════════════════
${pillarsPrompt}
`.trim();
}

export interface CreateAssistantOpts {
  pillarsJson: CampaignPillarsJson;
  maxDurationSec?: number;
  webhookUrl?: string;
  instructions?: string;
  openingSentence?: string;
}

export async function createVapiAssistant(opts: CreateAssistantOpts) {
  const name = opts.pillarsJson.interviewer_name ?? "Sarah";
  const org = opts.pillarsJson.org_name ?? "a research consulting firm";
  const durationSec = opts.maxDurationSec ?? 420;
  const durationMin = Math.round(durationSec / 60);

  let pillarsPrompt = buildPillarsPrompt(opts.pillarsJson);
  if (opts.instructions) {
    pillarsPrompt += `\n\nADDITIONAL INSTRUCTIONS:\n${opts.instructions}`;
  }

  const systemPrompt = buildSystemPrompt(pillarsPrompt, durationSec, name);

  const firstMessage =
    opts.openingSentence?.trim() ||
    (`Hey, this is ${name} calling on behalf of ${org}. ` +
      `We're doing a short confidential research conversation — should take about ${durationMin} minutes. ` +
      `The call is recorded just so I don't miss anything. Is now an okay time?`);

  const title = opts.pillarsJson.title ?? "Survey";
  const assistantName = `${title.slice(0, 28)} - Interview`;

  const payload: Record<string, unknown> = {
    name: assistantName,
    firstMessage,
    model: {
      provider: DEFAULT_MODEL_PROVIDER,
      model: DEFAULT_MODEL_NAME,
      temperature: DEFAULT_MODEL_TEMPERATURE,
      messages: [{ role: "system", content: systemPrompt }],
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
    maxDurationSeconds: durationSec + 30,
    endCallMessage: "Thanks again for your time. Take care.",
    endCallPhrases: ["have a great rest of your day", "take care", "goodbye for now"],
    backgroundSound: "off",
    backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
    modelOutputInMessagesEnabled: true,
    analysisPlan: {
      summaryPrompt:
        "Summarize this research interview in 3-5 concise bullet points. Focus on concrete facts, specific examples, and any quantitative data mentioned.",
      successEvaluationPrompt:
        "Evaluate whether this interview achieved: (1) trust and rapport established, (2) at least one concrete story captured, (3) participant spoke 70%+ of the time, (4) interviewer stayed neutral. Return Pass if all four met, Fail otherwise.",
      successEvaluationRubric: "PassFail",
    },
  };

  if (opts.webhookUrl) {
    payload.server = { url: opts.webhookUrl };
  }

  const response = await fetch(`${VAPI_API_BASE}/assistant`, {
    method: "POST",
    headers: vapiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi assistant create failed: ${response.status} ${body}`);
  }

  return (await response.json()) as { id: string; name?: string };
}

export async function createVapiOutboundCall(params: {
  assistantId: string;
  to: string;
  sessionId: string;
  contactId?: string;
  campaignId?: string;
}) {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("Missing VAPI_PHONE_NUMBER_ID");

  const payload = {
    assistantId: params.assistantId,
    phoneNumberId,
    customer: { number: params.to },
    metadata: {
      sessionId: params.sessionId,
      contactId: params.contactId ?? null,
      campaignId: params.campaignId ?? null,
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

  return (await response.json()) as { id: string; status?: string };
}

export async function getVapiCall(callId: string) {
  const response = await fetch(`${VAPI_API_BASE}/call/${callId}`, {
    method: "GET",
    headers: vapiHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi call fetch failed: ${response.status} ${body}`);
  }

  return (await response.json()) as {
    id: string;
    status?: string;
    endedReason?: string;
    recordingUrl?: string;
    transcript?: string;
    messages?: Array<Record<string, unknown>>;
    startedAt?: string;
    endedAt?: string;
  };
}
