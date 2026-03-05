import express from "express";
import type { Request, Response } from "express";
import { supabase } from "./db/supabase.js";
import { verifyVapiWebhookSignature } from "./providers/vapi.js";

interface SessionRuntime {
  sessionId: string;
  callId: string | null;
  callStartedAt: number;
  callEndedAt: number | null;
  ended: boolean;
  endReason: string | null;
  recordingUrl: string | null;
  recordingSid: string | null;
  turnIndex: number;
}

const sessions = new Map<string, SessionRuntime>();
const callIdToSessionId = new Map<string, string>();

let _baseUrl = "";
const callEndedResolvers = new Map<string, (info: CallEndedInfo) => void>();

export interface CallEndedInfo {
  sessionId: string;
  callId: string | null;
  endReason: string;
  durationSec: number;
  recordingUrl: string | null;
  recordingSid: string | null;
}

export function setBaseUrl(url: string) {
  _baseUrl = url;
}

export function registerSession(sessionId: string) {
  sessions.set(sessionId, {
    sessionId,
    callId: null,
    callStartedAt: Date.now(),
    callEndedAt: null,
    ended: false,
    endReason: null,
    recordingUrl: null,
    recordingSid: null,
    turnIndex: 0,
  });
}

export function attachCallToSession(sessionId: string, callId: string) {
  const runtime = sessions.get(sessionId);
  if (!runtime) return;
  runtime.callId = callId;
  callIdToSessionId.set(callId, sessionId);
}

export function waitForCallEnded(sessionId: string): Promise<CallEndedInfo> {
  return new Promise((resolve) => {
    callEndedResolvers.set(sessionId, resolve);
  });
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.text({ type: "application/json" }));
  app.use(express.json());

  app.post("/vapi/webhook", async (req: Request, res: Response) => {
    try {
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const signature =
        (req.headers["x-vapi-signature"] as string | undefined) ??
        (req.headers["vapi-signature"] as string | undefined);
      if (!verifyVapiWebhookSignature(rawBody, signature)) {
        res.status(401).json({ ok: false, error: "invalid signature" });
        return;
      }

      const payload = JSON.parse(rawBody || "{}") as Record<string, any>;
      const eventType = extractEventType(payload);
      const callId = extractCallId(payload);
      const sessionId = extractSessionId(payload, callId);

      if (!sessionId) {
        console.warn("[vapi/webhook] Missing sessionId in payload metadata.");
        res.sendStatus(200);
        return;
      }

      const runtime = sessions.get(sessionId);
      if (!runtime) {
        console.warn(`[vapi/webhook] Session runtime not registered: ${sessionId}`);
        res.sendStatus(200);
        return;
      }
      if (callId) {
        runtime.callId = callId;
        callIdToSessionId.set(callId, sessionId);
      }

      const turn = extractTurn(payload);
      if (turn?.text) {
        runtime.turnIndex += 1;
        const timing = extractTurnTiming(payload);
        const wordCount = turn.text.split(/\s+/).filter(Boolean).length;
        await supabase.from("turns").insert({
          session_id: sessionId,
          turn_index: runtime.turnIndex,
          speaker: turn.speaker,
          pillar_id: null,
          lens: null,
          phase: null,
          prompt_text: turn.speaker === "agent" ? turn.text : null,
          response_text: turn.speaker === "participant" ? turn.text : null,
          start_ms: timing.startMs,
          end_ms: timing.endMs,
          raw_event_payload: payload,
        });
      }

      const recording = extractRecording(payload);
      if (recording.recordingUrl) runtime.recordingUrl = recording.recordingUrl;
      if (recording.recordingSid) runtime.recordingSid = recording.recordingSid;

      if (isCallEndedEvent(payload, eventType)) {
        runtime.ended = true;
        runtime.callEndedAt = Date.now();
        runtime.endReason = extractEndReason(payload) ?? "completed";
        const durationSec = Math.max(
          1,
          Math.round((runtime.callEndedAt - runtime.callStartedAt) / 1000),
        );

        await supabase
          .from("sessions")
          .update({
            status: runtime.endReason === "completed" ? "completed" : "failed",
            ended_at: new Date(runtime.callEndedAt).toISOString(),
            duration_ms: runtime.callEndedAt - runtime.callStartedAt,
          })
          .eq("id", sessionId);

        const resolver = callEndedResolvers.get(sessionId);
        if (resolver) {
          resolver({
            sessionId,
            callId: runtime.callId,
            endReason: runtime.endReason,
            durationSec,
            recordingUrl: runtime.recordingUrl,
            recordingSid: runtime.recordingSid,
          });
          callEndedResolvers.delete(sessionId);
        }
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("[vapi/webhook] Error:", err);
      res.sendStatus(200);
    }
  });

  app.get("/webhook-url", (_req: Request, res: Response) => {
    res.json({ webhook: `${_baseUrl}/vapi/webhook` });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, sessions: sessions.size });
  });

  return app;
}

function extractEventType(payload: Record<string, any>): string {
  return (
    payload.message?.type ??
    payload.type ??
    payload.event ??
    payload.messageType ??
    "unknown"
  );
}

function extractCallId(payload: Record<string, any>): string | null {
  return (
    payload.call?.id ??
    payload.message?.call?.id ??
    payload.callId ??
    payload.message?.callId ??
    null
  );
}

function extractSessionId(
  payload: Record<string, any>,
  callId: string | null,
): string | null {
  const metadataSessionId =
    payload.metadata?.sessionId ??
    payload.call?.metadata?.sessionId ??
    payload.message?.metadata?.sessionId ??
    payload.message?.call?.metadata?.sessionId ??
    null;
  if (metadataSessionId) return metadataSessionId;
  if (callId && callIdToSessionId.has(callId)) return callIdToSessionId.get(callId)!;
  return null;
}

function extractTurnTiming(payload: Record<string, any>): {
  startMs: number | null;
  endMs: number | null;
} {
  const sfs =
    payload.message?.secondsFromStart ??
    payload.secondsFromStart ??
    null;
  const dur =
    payload.message?.duration ??
    payload.duration ??
    null;

  if (sfs == null) return { startMs: null, endMs: null };
  const startMs = Math.round(Number(sfs) * 1000);
  const endMs = dur != null ? Math.round((Number(sfs) + Number(dur)) * 1000) : null;
  return { startMs, endMs };
}

function extractTurn(payload: Record<string, any>): {
  speaker: "agent" | "participant";
  text: string | null;
} | null {
  const transcriptPayload =
    payload.message?.transcript ??
    payload.transcript ??
    payload.message?.text ??
    payload.text ??
    null;

  let text: string | null = null;
  let role: string | null = null;

  if (typeof transcriptPayload === "string") {
    text = transcriptPayload;
  } else if (transcriptPayload && typeof transcriptPayload === "object") {
    text =
      transcriptPayload.text ??
      transcriptPayload.content ??
      transcriptPayload.transcript ??
      null;
    role =
      transcriptPayload.role ??
      transcriptPayload.speaker ??
      transcriptPayload.source ??
      null;
  }

  if (!text || !text.trim()) return null;
  const normalized = String(role ?? payload.message?.role ?? payload.role ?? "").toLowerCase();

  if (normalized.includes("system")) return null;

  const speaker: "agent" | "participant" =
    normalized.includes("assistant") || normalized.includes("agent") || normalized.includes("bot")
      ? "agent"
      : "participant";

  return { speaker, text: text.trim() };
}

function extractRecording(payload: Record<string, any>): {
  recordingUrl: string | null;
  recordingSid: string | null;
} {
  const recordingUrl =
    payload.recordingUrl ??
    payload.call?.recordingUrl ??
    payload.call?.artifact?.recordingUrl ??
    payload.message?.call?.artifact?.recordingUrl ??
    null;
  const recordingSid =
    payload.recordingSid ??
    payload.call?.recordingSid ??
    payload.call?.artifact?.recordingSid ??
    payload.message?.call?.artifact?.recordingSid ??
    null;
  return {
    recordingUrl: recordingUrl ? String(recordingUrl) : null,
    recordingSid: recordingSid ? String(recordingSid) : null,
  };
}

function extractEndReason(payload: Record<string, any>): string | null {
  return (
    payload.endedReason ??
    payload.message?.endedReason ??
    payload.status ??
    payload.message?.status ??
    payload.call?.status ??
    payload.message?.call?.status ??
    null
  );
}

function isCallEndedEvent(payload: Record<string, any>, eventType: string): boolean {
  const status = String(
    payload.status ??
      payload.message?.status ??
      payload.call?.status ??
      payload.message?.call?.status ??
      "",
  ).toLowerCase();
  const type = String(eventType).toLowerCase();

  return (
    status === "ended" ||
    status === "completed" ||
    status === "failed" ||
    status === "busy" ||
    status === "no-answer" ||
    type.includes("end-of-call") ||
    type.includes("call-ended") ||
    type.includes("hang") ||
    type.includes("status-update")
  ) &&
    (status !== "in-progress" && status !== "queued");
}

export function cleanupSessionRuntime(sessionId: string) {
  const runtime = sessions.get(sessionId);
  if (runtime?.callId) {
    callIdToSessionId.delete(runtime.callId);
  }
  sessions.delete(sessionId);
  callEndedResolvers.delete(sessionId);
}

export function getSessionRuntime(sessionId: string): SessionRuntime | null {
  return sessions.get(sessionId) ?? null;
}

function _noop(_req: Request, res: Response) {
    res.sendStatus(200);
}
