import "dotenv/config";
import { Command } from "commander";
import { z } from "zod";
import fs from "fs";
import path from "path";
import ngrok from "@ngrok/ngrok";
import { createApp, sessions, setBaseUrl, waitForCallEnded, waitForRecording } from "../server.js";
import { createOutboundCall, downloadRecording } from "../twilio/client.js";
import { createInitialState } from "../orchestrator/state.js";
import { getSTT } from "../providers/stt.js";
import { generateSummary } from "../providers/llm.js";
import { supabase } from "../db/supabase.js";
import type { PillarsConfig } from "../db/types.js";

const PORT = 3456;

const PillarSchema = z.object({
  id: z.string(),
  question: z.string(),
});

const PillarsFileSchema = z.object({
  title: z.string().optional(),
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

  // 2. Create interview state
  const state = createInitialState(session.id, pillarsConfig, durationSec);
  sessions.set(session.id, state);

  // 3. Start Express server
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`  Server:   http://localhost:${PORT}`);
  });

  // 4. Start ngrok tunnel
  let tunnelUrl: string;
  const ngrokToken = process.env.NGROK_AUTHTOKEN;

  if (ngrokToken) {
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: ngrokToken,
    });
    tunnelUrl = listener.url()!;
  } else {
    console.log(
      "\n  [WARN] No NGROK_AUTHTOKEN set. Trying ngrok without auth...",
    );
    const listener = await ngrok.forward({ addr: PORT });
    tunnelUrl = listener.url()!;
  }

  console.log(`  Tunnel:   ${tunnelUrl}\n`);
  setBaseUrl(tunnelUrl);

  // 5. Place outbound call
  console.log(`  Calling ${opts.to}...`);
  const callEndedPromise = waitForCallEnded();
  const recordingPromise = waitForRecording();

  const call = await createOutboundCall({
    to: opts.to,
    webhookBaseUrl: tunnelUrl,
    sessionId: session.id,
  });

  console.log(`  Call SID: ${call.sid}\n`);
  state.callSid = call.sid;
  sessions.set(call.sid, state);

  await supabase
    .from("sessions")
    .update({ call_sid: call.sid })
    .eq("id", session.id);

  // 6. Wait for call to end
  console.log("  Waiting for call to complete...\n");
  await callEndedPromise;

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - state.callStartedAt;

  console.log(`  Call ended. Reason: ${state.endReason}`);
  console.log(`  Duration: ${Math.round(durationMs / 1000)}s`);
  console.log(`  Turns:    ${state.totalTurnCount}\n`);

  await supabase
    .from("sessions")
    .update({
      status: state.consentReceived ? "completed" : (state.endReason as any) ?? "failed",
      ended_at: endTime,
      duration_ms: durationMs,
    })
    .eq("id", session.id);

  // 7. Post-call processing
  let recordingPath = "";
  let recordingUrl = "";
  let recordingSid = "";
  let turnsCount = state.turns.length;

  if (state.consentReceived && state.endReason !== "no_consent") {
    console.log("  Waiting for recording...");

    try {
      const recInfo = await Promise.race([
        recordingPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Recording timeout")), 60_000),
        ),
      ]);

      recordingSid = recInfo.recordingSid;
      recordingUrl = recInfo.recordingUrl;

      console.log(`  Recording: ${recordingUrl}`);
      console.log(`  Downloading...`);

      recordingPath = await downloadRecording(recordingUrl, session.id);
      console.log(`  Saved to: ${recordingPath}\n`);

      await supabase.from("recordings").insert({
        session_id: session.id,
        recording_sid: recordingSid,
        recording_url: recordingUrl,
        duration_sec: recInfo.durationSec,
        downloaded_path: recordingPath,
      });

      // STT transcription
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
    } catch (err) {
      console.error("  [WARN] Recording/transcription failed:", err);
    }

    // Store turns-based transcript
    const turnsTranscript = state.turns.map((t) => ({
      turn_index: t.turnIndex,
      speaker: t.speaker,
      pillar_id: t.pillarId,
      lens: t.lens,
      phase: t.phase,
      start_ms: t.timestampMs,
      text: t.text,
    }));

    await supabase.from("transcripts").insert({
      session_id: session.id,
      type: "turns",
      content_json: { turns: turnsTranscript } as any,
      provider: null,
    });

    // Store plain text transcript
    const plainText = state.turns
      .map(
        (t) =>
          `[${t.speaker === "agent" ? "Interviewer" : "Participant"}] ${t.text}`,
      )
      .join("\n\n");

    await supabase.from("transcripts").insert({
      session_id: session.id,
      type: "plain_text",
      content_json: { text: plainText } as any,
      provider: null,
    });

    // Generate summary
    console.log("  Generating interview summary...\n");
    const summary = await generateSummary(plainText);

    // 8. Print final results
    console.log("=".repeat(60));
    console.log("  INTERVIEW COMPLETE");
    console.log("=".repeat(60));
    console.log(`\n  Session ID:     ${session.id}`);
    console.log(`  Campaign ID:    ${campaign.id}`);
    console.log(`  Call Status:    ${state.endReason}`);
    console.log(`  Duration:       ${Math.round(durationMs / 1000)}s`);
    console.log(`  Total Turns:    ${state.totalTurnCount}`);
    console.log(`  Recording URL:  ${recordingUrl}`);
    console.log(`  Local File:     ${recordingPath}`);
    console.log(`\n  DB Rows Created:`);
    console.log(`    campaigns:    1`);
    console.log(`    sessions:     1`);
    console.log(`    turns:        ${turnsCount}`);
    console.log(`    recordings:   1`);
    console.log(`    transcripts:  3 (turns + stt_final + plain_text)`);
    console.log(`\n  Summary:\n`);
    console.log(
      summary
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
    );
    console.log("\n" + "=".repeat(60) + "\n");
  } else {
    console.log("=".repeat(60));
    console.log("  INTERVIEW ENDED EARLY");
    console.log("=".repeat(60));
    console.log(`\n  Session ID:  ${session.id}`);
    console.log(`  Reason:      ${state.endReason}`);
    console.log(`  Consent:     ${state.consentReceived}`);
    console.log(`  Turns:       ${state.totalTurnCount}\n`);
    console.log("=".repeat(60) + "\n");
  }

  // 9. Shutdown
  server.close();
  await ngrok.disconnect();
  console.log("  Server and tunnel shut down. Done.\n");
  process.exit(0);
}
