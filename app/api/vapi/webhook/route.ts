import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

// Vapi endedReason values that represent actual failures (not normal call endings).
// Everything not in this set is treated as a successful completion.
const FAILED_END_REASONS = new Set([
  "pipeline-error-openai-llm-failed",
  "pipeline-error-openai-voice-failed",
  "pipeline-error-cartesia-voice-failed",
  "pipeline-error-deepinfra-voice-failed",
  "pipeline-error-eleven-labs-voice-failed",
  "pipeline-error-playht-voice-failed",
  "pipeline-error-custom-voice-failed",
  "pipeline-error-vapi-llm-failed",
  "pipeline-error-vapi-voice-failed",
  "pipeline-error-vapi-400-bad-request-validation-failed",
  "pipeline-error-vapi-500-server-error",
  "customer-busy",
  "customer-did-not-answer",
  "customer-did-not-give-microphone-permission",
  "voicemail",
]);

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const signature =
      request.headers.get("x-vapi-signature") ??
      request.headers.get("vapi-signature");
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody || "{}") as Record<string, any>;
    const eventType = extractEventType(payload);
    const callId = extractCallId(payload);
    const sessionId = extractSessionId(payload);
    const contactId = extractContactId(payload);

    if (!sessionId) {
      return new NextResponse(null, { status: 200 });
    }

    const supabase = createServiceClient();

    const turn = extractTurn(payload);
    if (turn?.text) {
      const { count } = await supabase
        .from("turns")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);

      const turnIndex = (count ?? 0) + 1;
      const timing = extractTurnTiming(payload);

      await supabase.from("turns").insert({
        session_id: sessionId,
        turn_index: turnIndex,
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
    if (recording.recordingUrl) {
      await supabase.from("recordings").insert({
        session_id: sessionId,
        recording_url: recording.recordingUrl,
      });
    }

    // Handle status-update events (session status only, no transcript/analyze)
    if (isStatusUpdateEvent(eventType)) {
      const rawStatus = String(
        payload.message?.status ?? payload.status ?? payload.call?.status ?? "",
      ).toLowerCase();
      if (rawStatus === "ended" || rawStatus === "completed" || rawStatus === "failed") {
        await supabase
          .from("sessions")
          .update({ status: rawStatus === "ended" ? "completed" : rawStatus, ended_at: new Date().toISOString() })
          .eq("id", sessionId);
      }
      return new NextResponse(null, { status: 200 });
    }

    if (isEndOfCallEvent(payload, eventType)) {
      console.info("[vapi/webhook] end-of-call", {
        eventType,
        sessionId,
        contactId,
        payloadKeys: Object.keys(payload),
        messageKeys: payload.message ? Object.keys(payload.message) : null,
        hasArtifact: Boolean(payload.message?.artifact),
        artifactKeys: payload.message?.artifact ? Object.keys(payload.message.artifact) : null,
        msgCount: extractVapiMessages(payload).length,
      });

      const endReason = extractEndReason(payload) ?? "completed";
      const status = FAILED_END_REASONS.has(endReason) ? "failed" : "completed";

      await supabase
        .from("sessions")
        .update({
          status,
          ended_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      if (contactId) {
        if (status === "completed") {
          await supabase
            .from("contacts")
            .update({ status: "completed", session_id: sessionId })
            .eq("id", contactId);
        }

        await supabase
          .from("call_attempts")
          .update({
            status: status === "completed" ? "completed" : "failed",
            ended_at: new Date().toISOString(),
            session_id: sessionId,
          })
          .eq("call_id", callId);
      }

      const vapiMessages = extractVapiMessages(payload);
      const normalizedMessages = normalizeTranscriptMessages(vapiMessages);

      // Fall back to Vapi's pre-built transcript string if message normalization yields nothing
      let plainText = normalizedMessages
        .map((m) => `${m.speaker === "interviewer" ? "Interviewer" : "Interviewee"}: ${m.text}`)
        .join("\n\n");

      if (!plainText) {
        const artifactTranscript = extractArtifactTranscript(payload);
        if (artifactTranscript) plainText = artifactTranscript;
      }

      if (plainText) {
        const { error: ptErr } = await supabase.from("transcripts").insert({
          session_id: sessionId,
          type: "plain_text",
          content_json: { text: plainText },
        });
        if (ptErr) console.error("[vapi/webhook] plain_text insert error:", ptErr.message);
      }

      if (normalizedMessages.length > 0) {
        const { error: tErr } = await supabase.from("transcripts").insert({
          session_id: sessionId,
          type: "turns",
          content_json: { turns: normalizedMessages },
        });
        if (tErr) console.error("[vapi/webhook] turns insert error:", tErr.message);
      }

      const analysis = extractAnalysis(payload);
      if (analysis) {
        const { error: aErr } = await supabase.from("transcripts").insert({
          session_id: sessionId,
          type: "vapi_analysis",
          content_json: analysis,
        });
        if (aErr) console.error("[vapi/webhook] vapi_analysis insert error:", aErr.message);
      }

      if (plainText) {
        const { data: sess } = await supabase
          .from("sessions")
          .select("campaign_id")
          .eq("id", sessionId)
          .single();

        if (sess?.campaign_id) {
          try {
            await inngest.send({
              name: "call/analyze",
              data: { sessionId, campaignId: sess.campaign_id },
            });
            console.info("[vapi/webhook] queued pillar analysis", { sessionId, campaignId: sess.campaign_id });
          } catch (err) {
            console.error("[vapi/webhook] failed to queue analysis:", err instanceof Error ? err.message : err);
          }
        }
      }
    }

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[vapi/webhook] Error:", err);
    return new NextResponse(null, { status: 200 });
  }
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return true;

  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const cleanHeader = signatureHeader.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, "utf8"),
      Buffer.from(cleanHeader, "utf8"),
    );
  } catch {
    return false;
  }
}

function extractEventType(payload: Record<string, any>): string {
  return payload.message?.type ?? payload.type ?? payload.event ?? "unknown";
}

function extractCallId(payload: Record<string, any>): string | null {
  return payload.call?.id ?? payload.message?.call?.id ?? payload.callId ?? null;
}

function extractSessionId(payload: Record<string, any>): string | null {
  return (
    payload.metadata?.sessionId ??
    payload.call?.metadata?.sessionId ??
    payload.message?.metadata?.sessionId ??
    payload.message?.call?.metadata?.sessionId ??
    null
  );
}

function extractContactId(payload: Record<string, any>): string | null {
  return (
    payload.metadata?.contactId ??
    payload.call?.metadata?.contactId ??
    payload.message?.metadata?.contactId ??
    payload.message?.call?.metadata?.contactId ??
    null
  );
}

function extractTurnTiming(payload: Record<string, any>) {
  const sfs = payload.message?.secondsFromStart ?? payload.secondsFromStart ?? null;
  const dur = payload.message?.duration ?? payload.duration ?? null;
  if (sfs == null) return { startMs: null, endMs: null };
  const startMs = Math.round(Number(sfs) * 1000);
  const endMs = dur != null ? Math.round((Number(sfs) + Number(dur)) * 1000) : null;
  return { startMs, endMs };
}

function extractTurn(payload: Record<string, any>) {
  const tp = payload.message?.transcript ?? payload.transcript ?? payload.message?.text ?? payload.text ?? null;
  let text: string | null = null;
  let role: string | null = null;

  if (typeof tp === "string") {
    text = tp;
  } else if (tp && typeof tp === "object") {
    text = tp.text ?? tp.content ?? tp.transcript ?? null;
    role = tp.role ?? tp.speaker ?? null;
  }

  if (!text?.trim()) return null;
  const normalized = String(role ?? payload.message?.role ?? payload.role ?? "").toLowerCase();
  if (normalized.includes("system")) return null;

  const speaker: "agent" | "participant" =
    normalized.includes("assistant") || normalized.includes("agent") || normalized.includes("bot")
      ? "agent"
      : "participant";

  return { speaker, text: text.trim() };
}

function extractRecording(payload: Record<string, any>) {
  const url =
    payload.recordingUrl ??
    payload.call?.recordingUrl ??
    payload.call?.artifact?.recordingUrl ??
    payload.message?.call?.artifact?.recordingUrl ??
    payload.message?.artifact?.recordingUrl ??
    null;
  return { recordingUrl: url ? String(url) : null };
}

function extractEndReason(payload: Record<string, any>): string | null {
  return (
    payload.endedReason ?? payload.message?.endedReason ?? payload.status ??
    payload.message?.status ?? payload.call?.status ?? null
  );
}

function isStatusUpdateEvent(eventType: string): boolean {
  return String(eventType).toLowerCase().includes("status-update");
}

function isEndOfCallEvent(payload: Record<string, any>, eventType: string): boolean {
  const status = String(
    payload.status ?? payload.message?.status ?? payload.call?.status ?? "",
  ).toLowerCase();
  const type = String(eventType).toLowerCase();

  if (type.includes("status-update")) return false;

  return (
    (status === "ended" || status === "completed" || status === "failed" ||
      status === "busy" || status === "no-answer" ||
      type.includes("end-of-call") || type.includes("call-ended")) &&
    status !== "in-progress" && status !== "queued"
  );
}

function extractVapiMessages(payload: Record<string, any>): Array<Record<string, any>> {
  const messages =
    payload.call?.messages ??
    payload.message?.call?.messages ??
    payload.message?.artifact?.messages ??
    payload.messages ??
    payload.artifact?.messages ?? [];
  return Array.isArray(messages)
    ? messages.filter((m: any) => m.role !== "system")
    : [];
}

function normalizeTranscriptMessages(
  messages: Array<Record<string, any>>,
): Array<{
  speaker: "interviewer" | "interviewee";
  text: string;
  role: string | null;
  startMs: number | null;
  endMs: number | null;
}> {
  return messages
    .map((message) => {
      const role = String(message.role ?? message.speaker ?? "").toLowerCase();
      if (role.includes("system")) return null;

      const speaker: "interviewer" | "interviewee" =
        role.includes("assistant") || role.includes("agent") || role.includes("bot")
          ? "interviewer"
          : "interviewee";

      const text = String(message.content ?? message.message ?? message.text ?? message.transcript ?? "").trim();
      if (!text) return null;

      const secondsFromStart = message.secondsFromStart;
      const duration = message.duration;
      const startMs =
        typeof secondsFromStart === "number" ? Math.round(secondsFromStart * 1000) : null;
      const endMs =
        typeof secondsFromStart === "number" && typeof duration === "number"
          ? Math.round((secondsFromStart + duration) * 1000)
          : null;

      return {
        speaker,
        text,
        role: message.role ?? null,
        startMs,
        endMs,
      };
    })
    .filter(
      (
        message,
      ): message is {
        speaker: "interviewer" | "interviewee";
        text: string;
        role: string | null;
        startMs: number | null;
        endMs: number | null;
      } => Boolean(message),
    );
}

function extractArtifactTranscript(payload: Record<string, any>): string | null {
  const t =
    payload.message?.artifact?.transcript ??
    payload.artifact?.transcript ??
    payload.message?.call?.artifact?.transcript ??
    null;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

function extractAnalysis(payload: Record<string, any>) {
  const analysis =
    payload.call?.analysis ??
    payload.message?.call?.analysis ??
    payload.message?.artifact?.analysis ??
    payload.analysis ??
    payload.artifact?.analysis ?? null;
  return analysis;
}
