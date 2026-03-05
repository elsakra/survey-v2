import express from "express";
import type { Request, Response } from "express";
import type { InterviewState } from "./orchestrator/state.js";
import { handleVoiceWebhook, processGather } from "./orchestrator/orchestrator.js";

export const sessions = new Map<string, InterviewState>();

let _baseUrl = "";
let resolveCallEnded: (() => void) | null = null;
let resolveRecordingReady: ((info: RecordingInfo) => void) | null = null;

export interface RecordingInfo {
  recordingSid: string;
  recordingUrl: string;
  durationSec: number;
}

export function setBaseUrl(url: string) {
  _baseUrl = url;
}

export function waitForCallEnded(): Promise<void> {
  return new Promise((resolve) => {
    resolveCallEnded = resolve;
  });
}

export function waitForRecording(): Promise<RecordingInfo> {
  return new Promise((resolve) => {
    resolveRecordingReady = resolve;
  });
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.post("/twilio/voice", async (req: Request, res: Response) => {
    try {
      const callSid = req.body.CallSid as string;
      const sessionId = (req.query.sessionId as string) ?? "";

      console.log(`[voice] Call answered. CallSid=${callSid} SessionId=${sessionId}`);

      const state = findState(sessionId, callSid);
      if (!state) {
        console.error(`[voice] No session found for ${sessionId}`);
        res.type("text/xml").send("<Response><Hangup/></Response>");
        return;
      }

      state.callSid = callSid;
      state.callStartedAt = Date.now();
      sessions.set(callSid, state);

      const twiml = await handleVoiceWebhook(state, _baseUrl);
      res.type("text/xml").send(twiml);
    } catch (err) {
      console.error("[voice] Error:", err);
      res.type("text/xml").send("<Response><Hangup/></Response>");
    }
  });

  app.post("/twilio/gather", async (req: Request, res: Response) => {
    try {
      const callSid =
        (req.query.callSid as string) ?? (req.body.CallSid as string);
      const speechResult = req.body.SpeechResult as string | undefined;
      const digits = req.body.Digits as string | undefined;

      console.log(
        `[gather] CallSid=${callSid} Speech="${speechResult ?? ""}" Digits="${digits ?? ""}"`,
      );

      const state = sessions.get(callSid);
      if (!state) {
        console.error(`[gather] No session for CallSid=${callSid}`);
        res.type("text/xml").send("<Response><Hangup/></Response>");
        return;
      }

      const result = await processGather(
        state,
        {
          speechResult,
          digits,
          callSid,
          rawPayload: req.body as Record<string, unknown>,
        },
        _baseUrl,
      );

      console.log(
        `[gather] Phase=${state.phase} Turn=${state.totalTurnCount} Done=${result.done}`,
      );

      res.type("text/xml").send(result.twiml);
    } catch (err) {
      console.error("[gather] Error:", err);
      res.type("text/xml").send(
        '<Response><Say voice="Polly.Joanna-Neural">Sorry, I had a technical issue. Thank you for your time.</Say><Hangup/></Response>',
      );
    }
  });

  app.post("/twilio/status", async (req: Request, res: Response) => {
    const callSid = req.body.CallSid as string;
    const callStatus = req.body.CallStatus as string;
    const duration = req.body.CallDuration as string | undefined;

    console.log(
      `[status] CallSid=${callSid} Status=${callStatus} Duration=${duration ?? "?"}s`,
    );

    const state = sessions.get(callSid);

    if (
      callStatus === "no-answer" ||
      callStatus === "busy" ||
      callStatus === "failed" ||
      callStatus === "canceled"
    ) {
      if (state) {
        state.callEnded = true;
        state.endReason = callStatus;
      }
      resolveCallEnded?.();
    }

    if (callStatus === "completed") {
      if (state) {
        state.callEnded = true;
        state.endReason = state.endReason ?? "completed";
      }
      resolveCallEnded?.();
    }

    res.sendStatus(200);
  });

  app.post("/twilio/recording", async (req: Request, res: Response) => {
    const recordingSid = req.body.RecordingSid as string;
    const recordingUrl = req.body.RecordingUrl as string;
    const durationStr = req.body.RecordingDuration as string | undefined;
    const status = req.body.RecordingStatus as string;

    console.log(
      `[recording] Sid=${recordingSid} Status=${status} Duration=${durationStr ?? "?"}s`,
    );

    if (status === "completed" && recordingUrl) {
      resolveRecordingReady?.({
        recordingSid,
        recordingUrl,
        durationSec: parseFloat(durationStr ?? "0"),
      });
    }

    res.sendStatus(200);
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, sessions: sessions.size });
  });

  return app;
}

function findState(
  sessionId: string,
  _callSid: string,
): InterviewState | undefined {
  for (const s of sessions.values()) {
    if (s.sessionId === sessionId) return s;
  }
  return undefined;
}
