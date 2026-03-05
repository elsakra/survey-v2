"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message {
  role: "assistant" | "user";
  content: string;
  startMs?: number | null;
  endMs?: number | null;
  receivedAt: string;
}

interface VoiceTestError {
  title: string;
  message: string;
  guidance?: string;
  details?: string;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeVoiceError(error: any): VoiceTestError {
  const rawMessage =
    error?.message ??
    error?.body?.message ??
    error?.body?.error ??
    "Unknown error";
  const message = String(rawMessage);
  const details = safeStringify(error);
  const lowered = `${message} ${details}`.toLowerCase();
  const assistantApiUnauthorized =
    error?.source === "assistant-api" && Number(error?.status) === 401;

  if (lowered.includes("permission") || lowered.includes("notallowederror")) {
    return {
      title: "Microphone permission blocked",
      message: "We couldn't access your microphone.",
      guidance: "Allow microphone access for this site, then click Test Again.",
      details,
    };
  }

  if (lowered.includes("notfounderror") || lowered.includes("device") || lowered.includes("microphone")) {
    return {
      title: "No microphone detected",
      message: "A working microphone was not found.",
      guidance: "Connect/select a microphone in system settings and try again.",
      details,
    };
  }

  if (lowered.includes("network") || lowered.includes("failed to fetch")) {
    return {
      title: "Network issue",
      message: "The browser could not reach the test-call service.",
      guidance: "Check your connection, then retry.",
      details,
    };
  }

  if (
    lowered.includes("invalid key") ||
    lowered.includes("private key instead of the public key") ||
    lowered.includes("public key instead of the private key")
  ) {
    return {
      title: "Vapi key misconfigured",
      message: "The browser voice SDK is using an invalid Vapi key.",
      guidance:
        "Set NEXT_PUBLIC_VAPI_PUBLIC_KEY to your Vapi public key (not the private key), then redeploy and try again.",
      details,
    };
  }

  if (assistantApiUnauthorized) {
    return {
      title: "Session expired",
      message: "Your login session is no longer valid.",
      guidance: "Sign in again and retry the test call.",
      details,
    };
  }

  if (lowered.includes("assistant") || lowered.includes("vapi") || lowered.includes("provider")) {
    return {
      title: "AI interviewer setup failed",
      message: "We couldn't create the test interviewer for this campaign.",
      guidance: "Check campaign configuration and try again in a few seconds.",
      details,
    };
  }

  return {
    title: "Test call failed",
    message: message === "Unknown error" ? "The test call did not start." : message,
    guidance: "Try again. If this keeps happening, open Technical details and share it.",
    details,
  };
}

export function VoiceTest({
  campaignId,
  allowSkip = true,
}: {
  campaignId: string;
  allowSkip?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "ended">("idle");
  const [ending, setEnding] = useState(false);
  const [completedThisRun, setCompletedThisRun] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<VoiceTestError | null>(null);
  const vapiRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const hadLiveSessionRef = useRef(false);
  const markedStatusRef = useRef<"completed" | "skipped" | null>(null);
  const seenMessageKeysRef = useRef<Set<string>>(new Set());

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  function normalizeRole(input: unknown): "assistant" | "user" {
    const role = String(input ?? "").toLowerCase();
    if (
      role.includes("assistant") ||
      role.includes("agent") ||
      role.includes("bot") ||
      role.includes("interviewer") ||
      role.includes("ai") ||
      role.includes("model")
    ) {
      return "assistant";
    }
    return "user";
  }

  function pushTranscriptLine(
    roleInput: unknown,
    contentInput: unknown,
    timingSource: any,
    fallbackReceivedAt?: string,
  ) {
    const content = String(contentInput ?? "").trim();
    if (!content) return;
    const role = normalizeRole(roleInput);
    const timing = parseMessageTiming(timingSource);
    const receivedAt = fallbackReceivedAt ?? new Date().toISOString();
    const dedupeKey = `${role}|${content}|${timing.startMs ?? "na"}|${timing.endMs ?? "na"}`;
    if (seenMessageKeysRef.current.has(dedupeKey)) return;
    seenMessageKeysRef.current.add(dedupeKey);

    addMessage({
      role,
      content,
      startMs: timing.startMs,
      endMs: timing.endMs,
      receivedAt,
    });
  }

  function ingestVapiMessage(msg: any) {
    if (!msg || typeof msg !== "object") return;

    // Shape 1: direct transcript event.
    if (msg.type === "transcript" && msg.transcriptType === "final") {
      pushTranscriptLine(msg.role ?? msg.speaker ?? msg.participant, msg.transcript ?? msg.text ?? msg.content, msg);
      return;
    }

    // Shape 2: a single assistant/user message payload.
    if (msg.type === "message" || msg.type === "assistant-message" || msg.type === "user-message") {
      const payload = msg.message ?? msg;
      pushTranscriptLine(
        payload.role ?? payload.speaker ?? payload.participant,
        payload.content ?? payload.text ?? payload.transcript,
        payload,
      );
    }

    // Shape 3: conversation update containing one or many messages.
    const conversation = msg.conversation ?? msg.messages ?? msg.call?.messages;
    if (Array.isArray(conversation)) {
      for (const entry of conversation) {
        pushTranscriptLine(
          entry?.role ?? entry?.speaker ?? entry?.participant,
          entry?.content ?? entry?.text ?? entry?.transcript,
          entry,
          new Date().toISOString(),
        );
      }
    }
  }

  function parseMessageTiming(msg: any): { startMs: number | null; endMs: number | null } {
    const secondsFromStart = msg?.secondsFromStart ?? msg?.timestampSeconds ?? null;
    const duration = msg?.duration ?? msg?.durationSeconds ?? null;
    if (secondsFromStart == null || Number.isNaN(Number(secondsFromStart))) {
      return { startMs: null, endMs: null };
    }
    const startMs = Math.round(Number(secondsFromStart) * 1000);
    const endMs =
      duration != null && !Number.isNaN(Number(duration))
        ? Math.round((Number(secondsFromStart) + Number(duration)) * 1000)
        : null;
    return { startMs, endMs };
  }

  function formatTimestamp(message: Message): string {
    if (message.startMs != null) {
      const toClock = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const min = Math.floor(totalSeconds / 60);
        const sec = totalSeconds % 60;
        return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      };
      const start = toClock(message.startMs);
      if (message.endMs != null && message.endMs >= message.startMs) {
        return `${start} - ${toClock(message.endMs)}`;
      }
      return start;
    }
    return new Date(message.receivedAt).toLocaleTimeString();
  }

  async function startTest() {
    setError(null);
    setStatus("connecting");
    setMessages([]);
    seenMessageKeysRef.current.clear();
    setEnding(false);
    setCompletedThisRun(false);
    hadLiveSessionRef.current = false;
    markedStatusRef.current = null;

    try {
      if (!vapiRef.current) {
        const { default: Vapi } = await import("@vapi-ai/web");
        const key = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
        if (!key) {
          throw new Error("Missing NEXT_PUBLIC_VAPI_PUBLIC_KEY");
        }
        vapiRef.current = new Vapi(key);
      }

      const vapi = vapiRef.current;

      // Ensure any previous call is fully terminated before starting a new one.
      try {
        await vapi.stop();
      } catch {
        // no-op: stop may fail if there is no active call
      }

      const res = await fetch(`/api/campaigns/${campaignId}/assistant`, { method: "POST" });
      if (!res.ok) {
        let body: any = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        throw {
          source: "assistant-api",
          status: res.status,
          body,
          message: body?.message ?? body?.error ?? "Failed to create assistant",
        };
      }
      const { assistantId } = await res.json();

      if (!vapiRef.current.__listenersBound) {
        vapi.on("speech-start", () => {});
        vapi.on("speech-end", () => {});
        vapi.on("message", (msg: any) => {
          ingestVapiMessage(msg);
        });
        vapi.on("call-start", () => {
          if (!mountedRef.current) return;
          hadLiveSessionRef.current = true;
          setStatus("active");
          setEnding(false);
        });
        vapi.on("call-end", async () => {
          if (!mountedRef.current) return;
          if (hadLiveSessionRef.current && markedStatusRef.current !== "completed") {
            markedStatusRef.current = "completed";
            setCompletedThisRun(true);
            void fetch(`/api/campaigns/${campaignId}/test-status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "completed" }),
            });
            router.refresh();
          }
          setStatus("ended");
          setEnding(false);
        });
        vapi.on("error", (e: any) => {
          if (!mountedRef.current) return;
          console.error("Vapi error:", e);
          setError(normalizeVoiceError(e));
          setStatus("ended");
          setEnding(false);
        });
        vapiRef.current.__listenersBound = true;
      }

      await vapi.start(assistantId);
    } catch (e: any) {
      setError(normalizeVoiceError(e));
      setStatus("idle");
      setEnding(false);
    }
  }

  async function skipTest() {
    if (markedStatusRef.current === "skipped") {
      router.push(`/dashboard/${campaignId}/contacts`);
      return;
    }

    try {
      markedStatusRef.current = "skipped";
      await fetch(`/api/campaigns/${campaignId}/test-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skipped" }),
      });
    } finally {
      router.push(`/dashboard/${campaignId}/contacts`);
      router.refresh();
    }
  }

  async function stopTest() {
    if (!vapiRef.current || ending) return;
    setEnding(true);
    try {
      await vapiRef.current.stop();
      // Keep UI responsive even if "call-end" event is delayed.
      if (hadLiveSessionRef.current) {
        setCompletedThisRun(true);
      }
      setStatus("ended");
    } catch (e: any) {
      setError(normalizeVoiceError(e));
      setStatus("ended");
    } finally {
      setEnding(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Best effort cleanup on unmount.
      vapiRef.current?.stop?.();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {status === "idle" || (status === "ended" && !completedThisRun) ? (
          <button
            onClick={startTest}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {status === "ended" ? "Test Again" : "Start Test Conversation"}
          </button>
        ) : status === "connecting" ? (
          <button disabled className="px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg">
            Connecting...
          </button>
        ) : status === "ended" && completedThisRun ? (
          <>
            <button
              onClick={() => router.push(`/dashboard/${campaignId}/contacts`)}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Continue to Contacts
            </button>
            <button
              onClick={startTest}
              className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Test Again
            </button>
          </>
        ) : (
          <button
            onClick={stopTest}
            disabled={ending}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {ending ? "Ending..." : "End Conversation"}
          </button>
        )}

        {status === "active" && (
          <span className="flex items-center gap-2 text-sm text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      {allowSkip && (
        <button
          type="button"
          onClick={skipTest}
          className="text-sm text-blue-600 hover:underline"
        >
          Skip test and continue to contacts
        </button>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
          <p className="font-medium">{error.title}</p>
          <p>{error.message}</p>
          {error.guidance && <p className="text-red-600">{error.guidance}</p>}
          {error.details && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-red-500">Technical details</summary>
              <pre className="mt-2 text-[11px] bg-white border border-red-100 rounded p-2 overflow-auto text-red-700">
                {error.details}
              </pre>
            </details>
          )}
        </div>
      )}

      {messages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <div className="w-24 shrink-0 mt-0.5">
                <span
                  className={`block text-xs font-medium uppercase ${
                    m.role === "assistant" ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  {m.role === "assistant" ? "Interviewer" : "Interviewee"}
                </span>
                <span className="block text-[11px] text-gray-400 mt-0.5">{formatTimestamp(m)}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Uses your desktop microphone. Make sure to allow microphone access when prompted.
      </p>
    </div>
  );
}
