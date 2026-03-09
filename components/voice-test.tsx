"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnalysisDisplay, type PillarAnalysis } from "./analysis-display";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface Message {
  role: "assistant" | "user";
  content: string;
  startMs?: number | null;
  endMs?: number | null;
  receivedAt: string;
}

type ParsedRole = "assistant" | "user" | null;

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
  const [analysis, setAnalysis] = useState<PillarAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const hadLiveSessionRef = useRef(false);
  const markedStatusRef = useRef<"completed" | "skipped" | null>(null);
  const seenMessageKeysRef = useRef<Set<string>>(new Set());

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.length === 0) return [message];

      const last = prev[prev.length - 1];
      if (last.role !== message.role) {
        return [...prev, message];
      }

      const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
      const lastText = normalizeText(last.content);
      const nextText = normalizeText(message.content);

      if (!nextText) return prev;
      if (nextText === lastText) return prev;
      if (lastText.startsWith(nextText)) return prev; // stale shorter update

      const closeInTime = (() => {
        if (last.startMs != null && message.startMs != null) {
          return Math.abs(message.startMs - last.startMs) <= 15000;
        }
        const lastAt = Date.parse(last.receivedAt);
        const nextAt = Date.parse(message.receivedAt);
        if (Number.isNaN(lastAt) || Number.isNaN(nextAt)) return true;
        return Math.abs(nextAt - lastAt) <= 15000;
      })();

      // Vapi may stream incremental growing variants of the same turn.
      if (closeInTime && nextText.startsWith(lastText)) {
        const replacement: Message = {
          ...message,
          startMs: last.startMs ?? message.startMs ?? null,
          endMs: message.endMs ?? last.endMs ?? null,
        };
        return [...prev.slice(0, -1), replacement];
      }

      return [...prev, message];
    });
  }, []);

  function normalizeRole(input: unknown): ParsedRole {
    const role = String(input ?? "").toLowerCase();
    if (
      role.includes("system") ||
      role.includes("tool") ||
      role.includes("developer") ||
      role.includes("instruction")
    ) {
      return null;
    }
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
    if (
      role.includes("user") ||
      role.includes("human") ||
      role.includes("participant") ||
      role.includes("interviewee") ||
      role.includes("caller")
    ) {
      return "user";
    }
    return null;
  }

  function isLikelyInstructionBlock(content: string): boolean {
    const lower = content.toLowerCase();
    return (
      content.length > 260 &&
      (lower.includes("mandatory opener sequence") ||
        lower.includes("you never reveal you are an ai") ||
        lower.includes("persona"))
    );
  }

  function resolveRole(roleInput: unknown, fallbackRole: ParsedRole = null): ParsedRole {
    const parsed = normalizeRole(roleInput);
    return parsed ?? fallbackRole;
  }

  function roleFromMessageType(typeInput: unknown): ParsedRole {
    const type = String(typeInput ?? "").toLowerCase();
    if (type.includes("assistant")) return "assistant";
    if (type.includes("user")) return "user";
    return null;
  }

  function pushTranscriptLine(
    roleInput: unknown,
    contentInput: unknown,
    timingSource: any,
    fallbackReceivedAt?: string,
    fallbackRole: ParsedRole = null,
  ) {
    const content = String(contentInput ?? "").trim();
    if (!content) return;
    const role = resolveRole(roleInput, fallbackRole);
    if (!role) return;
    if (isLikelyInstructionBlock(content)) return;
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
      pushTranscriptLine(
        msg.role ?? msg.speaker ?? msg.participant,
        msg.transcript ?? msg.text ?? msg.content,
        msg,
        undefined,
        "user",
      );
      return;
    }

    // Shape 2: a single assistant/user message payload.
    if (msg.type === "message" || msg.type === "assistant-message" || msg.type === "user-message") {
      const payload = msg.message ?? msg;
      pushTranscriptLine(
        payload.role ?? payload.speaker ?? payload.participant,
        payload.content ?? payload.text ?? payload.transcript,
        payload,
        undefined,
        roleFromMessageType(msg.type),
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
          null,
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
    setAnalysis(null);
    setAnalysisStatus("idle");
    setAnalysisError(null);
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

  async function generateAnalysis() {
    if (messages.length === 0) return;
    setAnalysisStatus("loading");
    setAnalysisError(null);

    const transcript = messages
      .map((m) => `${m.role === "assistant" ? "Interviewer" : "Interviewee"}: ${m.content}`)
      .join("\n\n");

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/analyze-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Analysis failed (${res.status})`);
      }
      const result = await res.json();
      setAnalysis(result);
      setAnalysisStatus("done");
    } catch (err: any) {
      setAnalysisError(err?.message ?? "Analysis failed");
      setAnalysisStatus("error");
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      vapiRef.current?.stop?.();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {status === "idle" || (status === "ended" && !completedThisRun) ? (
          <Button onClick={startTest}>
            {status === "ended" ? "Test Again" : "Start Test Conversation"}
          </Button>
        ) : status === "connecting" ? (
          <Button disabled variant="secondary">
            Connecting...
          </Button>
        ) : status === "ended" && completedThisRun ? (
          <>
            <Button onClick={() => router.push(`/dashboard/${campaignId}/contacts`)} variant="success">
              Continue to Contacts
            </Button>
            <Button onClick={startTest} variant="secondary">
              Test Again
            </Button>
          </>
        ) : (
          <Button onClick={stopTest} disabled={ending} variant="danger">
            {ending ? "Ending..." : "End Conversation"}
          </Button>
        )}

        {status === "active" && (
          <span className="flex items-center gap-2 text-sm text-[var(--color-success-strong)]">
            <span className="w-2 h-2 bg-[var(--color-success)] rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      {allowSkip && (
        <button
          type="button"
          onClick={skipTest}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Skip test and continue to contacts
        </button>
      )}

      {error && (
        <Alert variant="danger" className="space-y-1">
          <p className="font-medium">{error.title}</p>
          <p>{error.message}</p>
          {error.guidance && <p className="text-[var(--color-danger-strong)]">{error.guidance}</p>}
          {error.details && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-[var(--color-danger-strong)]">Technical details</summary>
              <pre className="mt-2 text-[11px] bg-white border border-[var(--color-danger-border)] rounded p-2 overflow-auto text-[var(--color-danger-strong)]">
                {error.details}
              </pre>
            </details>
          )}
        </Alert>
      )}

      {messages.length > 0 && (
        <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-subtle)] max-h-[500px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <div className="w-24 shrink-0 mt-0.5">
                <span
                  className={`block text-xs font-medium uppercase ${
                    m.role === "assistant" ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"
                  }`}
                >
                  {m.role === "assistant" ? "Interviewer" : "Interviewee"}
                </span>
                <span className="block text-[11px] text-[var(--color-text-muted)] mt-0.5">{formatTimestamp(m)}</span>
              </div>
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>
      )}

      {status === "ended" && messages.length > 0 && (
        <div className="space-y-4">
          {analysisStatus === "idle" && (
            <Button onClick={generateAnalysis}>
              Generate Analysis
            </Button>
          )}

          {analysisStatus === "loading" && (
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-subtle)] rounded-lg p-4 border border-[var(--color-border)]">
              <svg className="animate-spin h-4 w-4 text-[var(--color-accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing transcript against campaign pillars...
            </div>
          )}

          {analysisStatus === "error" && (
            <div className="text-sm text-[var(--color-danger-strong)] bg-[var(--color-danger-soft)] border border-[var(--color-danger-border)] rounded-lg p-3 flex items-start justify-between gap-3">
              <p>{analysisError ?? "Analysis failed"}</p>
              <button
                onClick={generateAnalysis}
                className="text-sm text-[var(--color-danger-strong)] hover:underline whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          )}

          {analysisStatus === "done" && analysis && (
            <div className="border-t border-[var(--color-border)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">
                Analysis Preview
              </h3>
              <AnalysisDisplay analysis={analysis} />
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        Uses your desktop microphone. Make sure to allow microphone access when prompted.
      </p>
    </div>
  );
}
