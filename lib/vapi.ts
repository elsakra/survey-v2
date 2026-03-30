import { buildInterviewSystemPrompt } from "./vapi-interview-prompt";

const VAPI_API_BASE = "https://api.vapi.ai";

const DEFAULT_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER ?? "groq";
const DEFAULT_MODEL_NAME = process.env.VAPI_MODEL_NAME ?? "openai/gpt-oss-120b";
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
    lines.push(
      `constraints: prefer measurable anchors (frequency, rough %, or range) when natural; at most one gentle clarifying ask if vague — never badger or loop`,
    );
  }
  return lines.join("\n");
}

export { buildInterviewSystemPrompt } from "./vapi-interview-prompt";
export type { InterviewPromptOptions } from "./vapi-interview-prompt";

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

  const systemPrompt = buildInterviewSystemPrompt(pillarsPrompt, durationSec, name, {
    preferQuantification: opts.pillarsJson.constraints?.prefer_quantification === true,
  });

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
