import "dotenv/config";
import { Command } from "commander";
import { z } from "zod";
import fs from "fs";
import path from "path";
import {
  attachCallToSession,
  cleanupSessionRuntime,
  createApp,
  registerSession,
  setBaseUrl,
  waitForCallEnded,
} from "../server.js";
import { getSTT } from "../providers/stt.js";
import { generateSummary } from "../providers/llm.js";
import { supabase } from "../db/supabase.js";
import type { PillarsConfig } from "../db/types.js";
import { startNgrokCli } from "../ngrok.js";
import {
  createConversationalAssistant,
  createVapiOutboundCall,
  downloadRecordingFromUrl,
  getVapiCall,
} from "../providers/vapi.js";

const PORT = 3456;

const PillarSchema = z.object({
  id: z.string(),
  question: z.string(),
});

const PillarsFileSchema = z.object({
  title: z.string().optional(),
  context: z.string().optional(),
  interviewer_name: z.string().optional(),
  org_name: z.string().optional(),
  pillars: z.array(PillarSchema).min(1).max(5),
  tone: z
    .object({ style: z.string() })
    .optional(),
  constraints: z
    .object({ prefer_quantification: z.boolean().optional() })
    .optional(),
});

const program = new Command();

program
  .name("interview")
  .description("Run an AI-conducted phone interview")
  .requiredOption("--to <phone>", "E.164 phone number to call")
  .requiredOption("--pillars-file <path>", "Path to pillars JSON file")
  .option("--duration-sec <seconds>", "Max interview duration in seconds", "420")
  .option("--title <title>", "Interview/campaign title")
  .action(async (opts) => {
    try {
      await runInterview(opts);
    } catch (err) {
      console.error("\n[FATAL]", err);
      process.exit(1);
    }
  });

program.parse();

async function runInterview(opts: {
  to: string;
  pillarsFile: string;
  durationSec: string;
  title?: string;
}) {
  for (const required of [
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VAPI_PRIVATE_KEY",
  ]) {
    if (!process.env[required]) {
      throw new Error(`Missing required env var: ${required}`);
    }
  }
  if (!process.env.VAPI_PHONE_NUMBER_ID && !process.env.VAPI_FROM_NUMBER) {
    throw new Error(
      "Missing required env: set VAPI_PHONE_NUMBER_ID or VAPI_FROM_NUMBER",
    );
  }

  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  if (!phoneRegex.test(opts.to)) {
    throw new Error(`Invalid E.164 phone number: ${opts.to}`);
  }

  const durationSec = parseInt(opts.durationSec, 10);
  if (isNaN(durationSec) || durationSec < 120 || durationSec > 1800) {
    throw new Error(`Duration must be 120-1800 seconds. Got: ${opts.durationSec}`);
  }

  const filePath = path.resolve(opts.pillarsFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Pillars file not found: ${filePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const pillarsConfig = PillarsFileSchema.parse(raw) as PillarsConfig;

  console.log("\n=== AI Interview Pipeline V1 ===\n");
  console.log(`  To:       ${opts.to}`);
  console.log(`  Pillars:  ${pillarsConfig.pillars.length}`);
  console.log(`  Duration: ${durationSec}s`);
  console.log(`  Title:    ${opts.title ?? pillarsConfig.title ?? "(none)"}\n`);

  // 1. Create campaign + session in DB
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .insert({
      title: opts.title ?? pillarsConfig.title ?? null,
      pillars_json: pillarsConfig as any,
    })
    .select()
    .single();

  if (campErr || !campaign) throw new Error(`Failed to create campaign: ${campErr?.message}`);

  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({
      campaign_id: campaign.id,
      to_number: opts.to,
      call_sid: null,
      consent: null,
      status: "pending",
      ended_at: null,
      duration_ms: null,
    })
    .select()
    .single();

  if (sessErr || !session) throw new Error(`Failed to create session: ${sessErr?.message}`);

  console.log(`  Campaign: ${campaign.id}`);
  console.log(`  Session:  ${session.id}\n`);

  // 2. Register runtime
  registerSession(session.id);

  // 3. Start Express server
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`  Server:   http://localhost:${PORT}`);
  });

  // 4. Start ngrok tunnel
  const ngrokTunnel = await startNgrokCli(PORT);
  const tunnelUrl = ngrokTunnel.url;

  console.log(`  Tunnel:   ${tunnelUrl}\n`);
  setBaseUrl(tunnelUrl);

  // 5. Create Vapi assistant + outbound call
  console.log(`  Calling ${opts.to}...`);
  const callEndedPromise = waitForCallEnded(session.id);

  const pillarsPromptObj: Record<string, unknown> = {
    title: opts.title ?? pillarsConfig.title ?? "Interview",
    tone: pillarsConfig.tone ?? { style: "warm, crisp, professional" },
    constraints: pillarsConfig.constraints ?? { prefer_quantification: true },
    pillars: pillarsConfig.pillars,
  };
  if (pillarsConfig.context) {
    pillarsPromptObj.research_context = pillarsConfig.context;
  }
  const pillarsPrompt = JSON.stringify(pillarsPromptObj, null, 2);

  const assistant = await createConversationalAssistant({
    title: opts.title ?? pillarsConfig.title ?? "Interview",
    pillarsPrompt,
    webhookUrl: `${tunnelUrl}/vapi/webhook`,
    maxDurationSec: durationSec,
    interviewerName: pillarsConfig.interviewer_name,
    orgName: pillarsConfig.org_name,
    preferQuantification: pillarsConfig.constraints?.prefer_quantification === true,
  });

  const call = await createVapiOutboundCall({
    assistantId: assistant.id,
    to: opts.to,
    sessionId: session.id,
    campaignTitle: opts.title ?? pillarsConfig.title,
  });

  console.log(`  Assistant ID: ${assistant.id}`);
  console.log(`  Call ID:      ${call.id}\n`);
  attachCallToSession(session.id, call.id);

  await supabase
    .from("sessions")
    .update({ call_sid: call.id, status: "in_progress" })
    .eq("id", session.id);

  // 6. Wait for call to end
  console.log("  Waiting for call to complete...\n");
  const callEndInfo = await waitForCallEndWithFallback(
    session.id,
    call.id,
    callEndedPromise,
    durationSec,
  );

  const endTime = new Date().toISOString();
  const durationMs = callEndInfo.durationSec * 1000;

  console.log(`  Call ended. Reason: ${callEndInfo.endReason}`);
  console.log(`  Duration: ${Math.round(durationMs / 1000)}s`);
  console.log(`  Turns:    (will compute from DB)\n`);

  await supabase
    .from("sessions")
    .update({
      status: callEndInfo.endReason === "completed" ? "completed" : "failed",
      ended_at: endTime,
      duration_ms: durationMs,
    })
    .eq("id", session.id);

  // 7. Post-call processing
  let recordingPath = "";
  let recordingUrl = callEndInfo.recordingUrl ?? "";
  let recordingSid = callEndInfo.recordingSid ?? "";
  let vapiCallDetails: any = null;

  try {
    const callDetails = await getVapiCall(call.id);
    vapiCallDetails = callDetails;
    recordingUrl =
      recordingUrl ||
      callDetails.recordingUrl ||
      String((callDetails.artifact as any)?.recordingUrl ?? "");
    recordingSid = recordingSid || String((callDetails.artifact as any)?.recordingSid ?? "");
  } catch (err) {
    console.warn("  [WARN] Could not fetch call details from Vapi:", err);
  }

  if (recordingUrl) {
    try {
      console.log(`  Recording: ${recordingUrl}`);
      console.log(`  Downloading...`);

      recordingPath = await downloadRecordingFromUrl(recordingUrl, session.id);
      console.log(`  Saved to: ${recordingPath}\n`);

      await supabase.from("recordings").insert({
        session_id: session.id,
        recording_sid: recordingSid || null,
        recording_url: recordingUrl,
        duration_sec: callEndInfo.durationSec,
        downloaded_path: recordingPath,
      });

    } catch (err) {
      console.error("  [WARN] Recording download/store failed:", err);
    }
  } else {
    console.warn("  [WARN] No recording URL found from Vapi.");
  }

  // Load turns captured via Vapi webhooks
  const { data: turnRows, error: turnErr } = await supabase
    .from("turns")
    .select("*")
    .eq("session_id", session.id)
    .order("turn_index", { ascending: true });
  if (turnErr) throw new Error(`Failed to read turns: ${turnErr.message}`);
  const turns = turnRows ?? [];
  if (turns.length === 0 && vapiCallDetails) {
    const fallbackTurns = buildFallbackTurnsFromVapi(vapiCallDetails);
    if (fallbackTurns.length > 0) {
      await supabase.from("turns").insert(
        fallbackTurns.map((t, idx) => ({
          session_id: session.id,
          turn_index: idx + 1,
          speaker: t.speaker,
          pillar_id: null,
          lens: null,
          phase: null,
          prompt_text: t.speaker === "agent" ? t.text : null,
          response_text: t.speaker === "participant" ? t.text : null,
          start_ms: null,
          end_ms: null,
          raw_event_payload: vapiCallDetails,
        })),
      );
    }
  }

  const { data: refreshedTurns } = await supabase
    .from("turns")
    .select("*")
    .eq("session_id", session.id)
    .order("turn_index", { ascending: true });

  const finalTurns = refreshedTurns ?? turns;
  const turnsCount = finalTurns.length;

  // Store turns-based transcript with enriched metadata
  const turnsTranscript = finalTurns.map((t: any) => {
    const text = t.prompt_text ?? t.response_text ?? "";
    const words = text.split(/\s+/).filter(Boolean).length;
    const dMs = (t.start_ms != null && t.end_ms != null) ? t.end_ms - t.start_ms : null;
    return {
      turn_index: t.turn_index,
      speaker: t.speaker,
      pillar_id: t.pillar_id,
      lens: t.lens,
      phase: t.phase,
      start_ms: t.start_ms,
      end_ms: t.end_ms,
      duration_ms: dMs,
      word_count: words,
      is_question: text.trim().endsWith("?"),
      text,
    };
  });

  await supabase.from("transcripts").insert({
    session_id: session.id,
    type: "turns",
    content_json: { turns: turnsTranscript } as any,
    provider: null,
  });

  // Store plain text transcript
  const plainText = finalTurns
    .map((t: any) => {
      const text = t.prompt_text ?? t.response_text ?? "";
      const speaker = t.speaker === "agent" ? "Interviewer" : "Participant";
      return `[${speaker}] ${text}`;
    })
    .join("\n\n");

  await supabase.from("transcripts").insert({
    session_id: session.id,
    type: "plain_text",
    content_json: { text: plainText } as any,
    provider: null,
  });

  // STT transcription from recording for high-quality final
  let sttStored = false;
  if (recordingPath) {
    try {
      console.log("  Transcribing with Whisper...");
      const stt = getSTT();
      const sttResult = await stt.transcribe(recordingPath);
      console.log(
        `  Transcribed: ${sttResult.segments.length} segments, ${sttResult.text.length} chars\n`,
      );

      await supabase.from("transcripts").insert({
        session_id: session.id,
        type: "stt_final",
        content_json: {
          segments: sttResult.segments,
          text: sttResult.text,
          provider: sttResult.provider,
          model: sttResult.model,
          duration: sttResult.duration,
        } as any,
        provider: "whisper",
      });
      sttStored = true;
    } catch (err) {
      console.error("  [WARN] STT transcription failed:", err);
    }
  }

  // Build speaker-diarized transcript by aligning Whisper words with Vapi turn boundaries
  let diarizedStored = false;
  if (sttStored && finalTurns.length > 0) {
    try {
      const { data: sttRow } = await supabase
        .from("transcripts")
        .select("content_json")
        .eq("session_id", session.id)
        .eq("type", "stt_final")
        .single();

      if (sttRow?.content_json) {
        const sttData = sttRow.content_json as any;
        const segments: Array<{ start: number; end: number; text: string }> =
          sttData.segments ?? [];

        const turnsWithTiming = finalTurns
          .filter((t: any) => t.start_ms != null)
          .map((t: any) => ({
            turnIndex: t.turn_index,
            speaker: t.speaker,
            startSec: t.start_ms / 1000,
            endSec: t.end_ms != null ? t.end_ms / 1000 : Infinity,
            text: t.prompt_text ?? t.response_text ?? "",
          }));

        if (turnsWithTiming.length > 0 && segments.length > 0) {
          const diarizedSegments = segments.map((seg) => {
            const midpoint = (seg.start + seg.end) / 2;
            let bestTurn = turnsWithTiming[0];
            let bestDist = Infinity;
            for (const turn of turnsWithTiming) {
              if (midpoint >= turn.startSec && midpoint <= turn.endSec) {
                bestTurn = turn;
                bestDist = 0;
                break;
              }
              const dist = Math.min(
                Math.abs(midpoint - turn.startSec),
                Math.abs(midpoint - turn.endSec),
              );
              if (dist < bestDist) {
                bestDist = dist;
                bestTurn = turn;
              }
            }
            return {
              start: seg.start,
              end: seg.end,
              text: seg.text,
              speaker: bestTurn.speaker === "agent" ? "Interviewer" : "Participant",
              turn_index: bestTurn.turnIndex,
            };
          });

          await supabase.from("transcripts").insert({
            session_id: session.id,
            type: "stt_diarized",
            content_json: { segments: diarizedSegments } as any,
            provider: "whisper+vapi",
          });
          diarizedStored = true;
          console.log(`  Built speaker-diarized transcript: ${diarizedSegments.length} segments.\n`);
        }
      }
    } catch (err) {
      console.warn("  [WARN] Failed to build diarized transcript:", err);
    }
  }

  // Store Vapi analysis data if available
  let vapiAnalysisStored = false;
  if (vapiCallDetails?.analysis) {
    try {
      await supabase.from("transcripts").insert({
        session_id: session.id,
        type: "vapi_analysis",
        content_json: vapiCallDetails.analysis as any,
        provider: "vapi",
      });
      vapiAnalysisStored = true;
      console.log("  Stored Vapi call analysis.\n");
    } catch (err) {
      console.warn("  [WARN] Failed to store Vapi analysis:", err);
    }
  }

  // Compute and store call-quality metrics
  let metricsStored = false;
  if (finalTurns.length > 0) {
    try {
      const agentTurns = finalTurns.filter((t: any) => t.speaker === "agent");
      const participantTurns = finalTurns.filter((t: any) => t.speaker === "participant");

      const wordCount = (t: any): number => {
        const text = t.prompt_text ?? t.response_text ?? "";
        return text.split(/\s+/).filter(Boolean).length;
      };

      const agentWords = agentTurns.reduce((sum: number, t: any) => sum + wordCount(t), 0);
      const participantWords = participantTurns.reduce((sum: number, t: any) => sum + wordCount(t), 0);
      const totalWords = agentWords + participantWords;

      const agentTurnLengths = agentTurns.map(wordCount);
      const avgAgentTurnLength = agentTurnLengths.length > 0
        ? Math.round(agentTurnLengths.reduce((a: number, b: number) => a + b, 0) / agentTurnLengths.length)
        : 0;
      const longestAgentTurn = agentTurnLengths.length > 0
        ? Math.max(...agentTurnLengths)
        : 0;

      let interruptionCount = 0;
      for (let i = 1; i < finalTurns.length; i++) {
        const prev = finalTurns[i - 1] as any;
        const curr = finalTurns[i] as any;
        if (prev.end_ms != null && curr.start_ms != null && curr.start_ms < prev.end_ms) {
          interruptionCount++;
        }
      }

      const callMetrics = {
        talk_ratio: totalWords > 0 ? +(participantWords / totalWords).toFixed(2) : 0,
        agent_words: agentWords,
        participant_words: participantWords,
        avg_agent_turn_length: avgAgentTurnLength,
        longest_agent_turn: longestAgentTurn,
        turn_count: finalTurns.length,
        agent_turn_count: agentTurns.length,
        participant_turn_count: participantTurns.length,
        interruption_count: interruptionCount,
        duration_seconds: Math.round(durationMs / 1000),
      };

      await supabase.from("transcripts").insert({
        session_id: session.id,
        type: "call_metrics",
        content_json: callMetrics as any,
        provider: null,
      });
      metricsStored = true;

      console.log(`  Call Metrics:`);
      console.log(`    Talk ratio (participant): ${(callMetrics.talk_ratio * 100).toFixed(0)}%`);
      console.log(`    Avg agent turn:           ${avgAgentTurnLength} words`);
      console.log(`    Longest agent turn:       ${longestAgentTurn} words`);
      console.log(`    Interruptions detected:   ${interruptionCount}`);
      console.log();
    } catch (err) {
      console.warn("  [WARN] Failed to compute/store call metrics:", err);
    }
  }

  // Generate summary
  console.log("  Generating interview summary...\n");
  const summary = await generateSummary(
    plainText || "No transcript captured for this interview.",
  );

  // 8. Print final results
  console.log("=".repeat(60));
  console.log("  INTERVIEW COMPLETE");
  console.log("=".repeat(60));
  console.log(`\n  Session ID:     ${session.id}`);
  console.log(`  Campaign ID:    ${campaign.id}`);
  console.log(`  Call Status:    ${callEndInfo.endReason}`);
  console.log(`  Duration:       ${Math.round(durationMs / 1000)}s`);
  console.log(`  Total Turns:    ${turnsCount}`);
  console.log(`  Recording URL:  ${recordingUrl || "(none)"}`);
  console.log(`  Local File:     ${recordingPath || "(none)"}`);
  console.log(`\n  DB Rows Created:`);
  console.log(`    campaigns:    1`);
  console.log(`    sessions:     1`);
  console.log(`    turns:        ${turnsCount}`);
  console.log(`    recordings:   ${recordingPath ? 1 : 0}`);
  const transcriptTypes = ["turns", "plain_text"];
  if (sttStored) transcriptTypes.push("stt_final");
  if (diarizedStored) transcriptTypes.push("stt_diarized");
  if (vapiAnalysisStored) transcriptTypes.push("vapi_analysis");
  if (metricsStored) transcriptTypes.push("call_metrics");
  console.log(`    transcripts:  ${transcriptTypes.length} (${transcriptTypes.join(" + ")})`);
  console.log(`\n  Summary:\n`);
  console.log(
    summary
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
  );
  console.log("\n" + "=".repeat(60) + "\n");

  // 9. Shutdown
  server.close();
  await ngrokTunnel.stop();
  cleanupSessionRuntime(session.id);
  console.log("  Server and tunnel shut down. Done.\n");
  process.exit(0);
}

async function waitForCallEndWithFallback(
  sessionId: string,
  callId: string,
  webhookPromise: Promise<{
    sessionId: string;
    callId: string | null;
    endReason: string;
    durationSec: number;
    recordingUrl: string | null;
    recordingSid: string | null;
  }>,
  durationSec: number,
) {
  const timeoutMs = (durationSec + 180) * 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const webhookResult = await Promise.race([
      webhookPromise.then((v) => ({ kind: "webhook" as const, value: v })),
      new Promise<{ kind: "none" }>((resolve) =>
        setTimeout(() => resolve({ kind: "none" }), 4000),
      ),
    ]);
    if (webhookResult.kind === "webhook") {
      return webhookResult.value;
    }

    const vapiCall = await getVapiCall(callId);
    const status = String(vapiCall.status ?? "").toLowerCase();
    if (status === "ended" || status === "completed" || status === "failed") {
      const started = vapiCall.startedAt ? Date.parse(vapiCall.startedAt) : Date.now();
      const ended = vapiCall.endedAt ? Date.parse(vapiCall.endedAt) : Date.now();
      const duration = Math.max(1, Math.round((ended - started) / 1000));
      return {
        sessionId,
        callId,
        endReason: vapiCall.endedReason ?? status ?? "ended",
        durationSec: duration,
        recordingUrl: (
          vapiCall.recordingUrl ??
          String((vapiCall.artifact as any)?.recordingUrl ?? "") ??
          ""
        ) || null,
        recordingSid: String((vapiCall.artifact as any)?.recordingSid ?? "") || null,
      };
    }
  }

  throw new Error(
    `Timed out waiting for call completion for session ${sessionId} / call ${callId}`,
  );
}

function buildFallbackTurnsFromVapi(callDetails: any): Array<{
  speaker: "agent" | "participant";
  text: string;
}> {
  const out: Array<{ speaker: "agent" | "participant"; text: string }> = [];

  if (Array.isArray(callDetails?.messages)) {
    for (const msg of callDetails.messages) {
      const text = String(msg?.message ?? msg?.content ?? msg?.text ?? "").trim();
      if (!text) continue;
      const role = String(msg?.role ?? msg?.speaker ?? "").toLowerCase();
      if (role.includes("system")) continue;
      const speaker: "agent" | "participant" =
        role.includes("assistant") || role.includes("agent") || role.includes("bot")
          ? "agent"
          : "participant";
      out.push({ speaker, text });
    }
    if (out.length > 0) return out;
  }

  const transcript = String(callDetails?.transcript ?? "").trim();
  if (transcript) {
    // Best effort: store as participant if no speaker segmentation available.
    out.push({ speaker: "participant", text: transcript });
  }
  return out;
}
