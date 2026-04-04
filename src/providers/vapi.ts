import crypto from "crypto";
import fs from "fs";
import path from "path";

import { buildInterviewSystemPrompt } from "../../lib/vapi-interview-prompt";
import { shortenOrgLabel } from "../../lib/vapi";

const VAPI_API_BASE = "https://api.vapi.ai";

const DEFAULT_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER ?? "openai";
const DEFAULT_MODEL_NAME = process.env.VAPI_MODEL_NAME ?? "gpt-4o";
const DEFAULT_MODEL_TEMPERATURE = Number(process.env.VAPI_MODEL_TEMPERATURE ?? "0.3");
const DEFAULT_VOICE_SPEED = Number(process.env.VAPI_VOICE_SPEED ?? "0.98");
const DEFAULT_VOICE_STABILITY = Number(process.env.VAPI_VOICE_STABILITY ?? "0.5");
const DEFAULT_VOICE_SIMILARITY = Number(process.env.VAPI_VOICE_SIMILARITY ?? "0.8");
const DEFAULT_WAIT_SECONDS = Number(process.env.VAPI_WAIT_SECONDS ?? "0.6");
const DEFAULT_OUTBOUND_WAIT_SECONDS = Number(process.env.VAPI_OUTBOUND_WAIT_SECONDS ?? "1.35");
const DEFAULT_RESPONSE_DELAY_SECONDS = Number(process.env.VAPI_RESPONSE_DELAY_SECONDS ?? "0.28");
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
  preferQuantification?: boolean;
  openingSentence?: string;
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
  const org = shortenOrgLabel(input.orgName ?? "a research consulting firm", 48);
  const durationMin = Math.round(input.maxDurationSec / 60);

  const firstMessage = input.openingSentence?.trim()
    ? input.openingSentence.trim()
    : `Hi — it's ${name} from ${org}. Scheduled research callback.`;

  const systemContent = buildInterviewSystemPrompt(input.pillarsPrompt, input.maxDurationSec, name, {
    preferQuantification: input.preferQuantification === true,
    channel: "outboundPhone",
  });

  const payload = {
    name: assistantName,
    firstMessage,
    firstMessageMode: "assistant-waits-for-user",
    model: {
      provider: DEFAULT_MODEL_PROVIDER,
      model: DEFAULT_MODEL_NAME,
      temperature: DEFAULT_MODEL_TEMPERATURE,
      messages: [
        {
          role: "system",
          content: systemContent,
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
      waitSeconds: DEFAULT_OUTBOUND_WAIT_SECONDS,
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
    endCallMessage: "Thanks — take care.",
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

