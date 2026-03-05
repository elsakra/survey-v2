import {
  type InterviewState,
  type AssessorOutput,
  type TurnRecord,
  type Phase,
  type Lens,
  detectStopIntent,
  detectConsentResponse,
  isTimedOut,
  isPillarTimedOut,
  isTurnCapped,
  isPillarTurnCapped,
  evidenceSufficient,
} from "./state.js";
import { runAssessor, runInterviewer } from "../providers/llm.js";
import { buildAssessorPrompt } from "../prompts/assessor.js";
import { buildInterviewerPrompt } from "../prompts/interviewer.js";
import { sayAndGather, sayAndHangup } from "../twilio/twiml.js";
import { supabase } from "../db/supabase.js";

export interface GatherResult {
  speechResult?: string;
  digits?: string;
  callSid: string;
  rawPayload: Record<string, unknown>;
}

export interface ProcessResult {
  twiml: string;
  done: boolean;
}

const gatherUrl = (baseUrl: string, callSid: string) =>
  `${baseUrl}/twilio/gather?callSid=${callSid}`;

export async function handleVoiceWebhook(
  state: InterviewState,
  baseUrl: string,
): Promise<string> {
  const text =
    "Hi there. Thanks for taking the time. Before we begin, I should let you know this call is being recorded for research purposes. " +
    "Do you consent to being recorded? You can press 1 or say yes to continue, or press 2 or say no to end the call.";

  state.lastAgentText = text;
  addAgentTurn(state, text);

  return sayAndGather({
    text,
    actionUrl: gatherUrl(baseUrl, state.callSid!),
    timeout: 10,
    inputType: "speech dtmf",
  });
}

export async function processGather(
  state: InterviewState,
  gather: GatherResult,
  baseUrl: string,
): Promise<ProcessResult> {
  const actionUrl = gatherUrl(baseUrl, state.callSid!);

  const speechText = gather.speechResult?.trim() ?? "";
  const isSilence = !speechText && !gather.digits;

  if (isSilence) {
    return handleSilence(state, actionUrl);
  }

  state.silenceCount = 0;

  if (state.phase === "CONSENT") {
    return handleConsent(state, gather, actionUrl);
  }

  if (detectStopIntent(speechText)) {
    return handleStopIntent(state);
  }

  addParticipantTurn(state, speechText, gather.rawPayload);

  if (isTimedOut(state) || isTurnCapped(state)) {
    return transitionToWrapup(state, actionUrl, "time/turn limit reached");
  }

  if (state.phase === "WARMUP") {
    return handleWarmup(state, speechText, actionUrl);
  }

  if (state.phase === "PILLAR_LOOP") {
    return handlePillarLoop(state, speechText, actionUrl);
  }

  if (state.phase === "WRAPUP") {
    return handleWrapup(state, speechText);
  }

  return { twiml: sayAndHangup("Thank you for your time. Goodbye."), done: true };
}

async function handleConsent(
  state: InterviewState,
  gather: GatherResult,
  actionUrl: string,
): Promise<ProcessResult> {
  const consent = detectConsentResponse(gather.speechResult, gather.digits);

  if (consent === "yes") {
    state.consentReceived = true;
    state.phase = "WARMUP";

    await supabase
      .from("sessions")
      .update({ consent: true, status: "in_progress" })
      .eq("id", state.sessionId);

    addParticipantTurn(state, gather.speechResult ?? "yes", gather.rawPayload);

    const { system, user } = buildInterviewerPrompt(state, null);
    const agentText = await runInterviewer(system, user);
    state.lastAgentText = agentText;
    addAgentTurn(state, agentText);

    return {
      twiml: sayAndGather({ text: agentText, actionUrl }),
      done: false,
    };
  }

  if (consent === "no") {
    state.consentReceived = false;
    state.phase = "END";
    state.callEnded = true;
    state.endReason = "no_consent";

    await supabase
      .from("sessions")
      .update({ consent: false, status: "no_consent", ended_at: new Date().toISOString() })
      .eq("id", state.sessionId);

    return {
      twiml: sayAndHangup(
        "No problem at all. Thank you for your time. Have a great day.",
      ),
      done: true,
    };
  }

  const text =
    "Sorry, I didn't catch that. Could you say yes or press 1 to continue, or say no or press 2 to end?";
  state.lastAgentText = text;
  addAgentTurn(state, text);

  return {
    twiml: sayAndGather({ text, actionUrl, timeout: 10, inputType: "speech dtmf" }),
    done: false,
  };
}

function handleSilence(
  state: InterviewState,
  actionUrl: string,
): ProcessResult {
  state.silenceCount++;

  if (state.silenceCount === 1) {
    const text = "I didn't catch that. Could you repeat what you said?";
    addAgentTurn(state, text);
    return {
      twiml: sayAndGather({ text, actionUrl }),
      done: false,
    };
  }

  if (state.silenceCount === 2) {
    const text =
      "No worries. Would you like me to repeat the question, or shall we skip to the next topic?";
    addAgentTurn(state, text);
    return {
      twiml: sayAndGather({ text, actionUrl }),
      done: false,
    };
  }

  state.callEnded = true;
  state.endReason = "silence";
  return {
    twiml: sayAndHangup(
      "That's totally fine. Thank you so much for your time today. Have a great day.",
    ),
    done: true,
  };
}

async function handleWarmup(
  state: InterviewState,
  _speechText: string,
  actionUrl: string,
): Promise<ProcessResult> {
  state.warmupTurnCount++;

  if (state.warmupTurnCount >= 2) {
    state.phase = "PILLAR_LOOP";
    state.pillarStartedAt = Date.now();

    const pillar = state.pillars[state.currentPillarIndex];
    const { system, user } = buildInterviewerPrompt(state, null);
    const agentText = await runInterviewer(system, user);
    state.lastAgentText = agentText;
    addAgentTurn(state, agentText, pillar?.id);

    return {
      twiml: sayAndGather({ text: agentText, actionUrl }),
      done: false,
    };
  }

  const { system, user } = buildInterviewerPrompt(state, null);
  const agentText = await runInterviewer(system, user);
  state.lastAgentText = agentText;
  addAgentTurn(state, agentText);

  return {
    twiml: sayAndGather({ text: agentText, actionUrl }),
    done: false,
  };
}

async function handlePillarLoop(
  state: InterviewState,
  speechText: string,
  actionUrl: string,
): Promise<ProcessResult> {
  const pillar = state.pillars[state.currentPillarIndex];
  if (!pillar) {
    return transitionToWrapup(state, actionUrl, "all pillars exhausted");
  }

  const assessorPrompt = buildAssessorPrompt(state, speechText);
  const assessor = await runAssessor(assessorPrompt.system, assessorPrompt.user);

  const pid = pillar.id;
  state.pillarEvidence.set(pid, assessor.coverage);

  const count = (state.pillarFollowUpCount.get(pid) ?? 0) + 1;
  state.pillarFollowUpCount.set(pid, count);

  if (assessor.recommended_lens) {
    const lenses = state.pillarLensesUsed.get(pid) ?? [];
    lenses.push(assessor.recommended_lens as Lens);
    state.pillarLensesUsed.set(pid, lenses);
  }

  const shouldMovePillar =
    assessor.next_action === "NEXT_PILLAR" ||
    assessor.next_action === "WRAPUP" ||
    evidenceSufficient(assessor.coverage) ||
    isPillarTimedOut(state) ||
    isPillarTurnCapped(state) ||
    assessor.boredom_risk >= 0.7;

  if (shouldMovePillar) {
    const nextIndex = state.currentPillarIndex + 1;

    if (nextIndex >= state.pillars.length || assessor.next_action === "WRAPUP") {
      return transitionToWrapup(state, actionUrl, "pillars complete");
    }

    state.currentPillarIndex = nextIndex;
    state.pillarStartedAt = Date.now();

    const nextPillar = state.pillars[nextIndex];
    const transitionText = "That's super helpful. I've got a solid picture on that. Let me move us to the next area.";
    addAgentTurn(state, transitionText, pillar.id);

    const { system, user } = buildInterviewerPrompt(state, null);
    const agentText = await runInterviewer(system, user);
    const fullText = `${transitionText} ${agentText}`;
    state.lastAgentText = fullText;
    addAgentTurn(state, agentText, nextPillar.id);

    return {
      twiml: sayAndGather({ text: fullText, actionUrl }),
      done: false,
    };
  }

  const { system, user } = buildInterviewerPrompt(state, assessor);
  const agentText = await runInterviewer(system, user);
  state.lastAgentText = agentText;
  addAgentTurn(state, agentText, pid, assessor.recommended_lens);

  return {
    twiml: sayAndGather({ text: agentText, actionUrl }),
    done: false,
  };
}

async function handleWrapup(
  state: InterviewState,
  _speechText: string,
): Promise<ProcessResult> {
  state.phase = "END";
  state.callEnded = true;
  state.endReason = "completed";

  const { system, user } = buildInterviewerPrompt(state, null);
  const goodbyeText = await runInterviewer(system, user);

  const fullText = `${goodbyeText} Thanks so much for your time today. This has been really valuable. Take care!`;
  addAgentTurn(state, fullText);

  return {
    twiml: sayAndHangup(fullText),
    done: true,
  };
}

async function transitionToWrapup(
  state: InterviewState,
  actionUrl: string,
  reason: string,
): Promise<ProcessResult> {
  state.phase = "WRAPUP";
  console.log(`[orchestrator] Transitioning to WRAPUP: ${reason}`);

  const { system, user } = buildInterviewerPrompt(state, null);
  const agentText = await runInterviewer(system, user);
  state.lastAgentText = agentText;
  addAgentTurn(state, agentText);

  return {
    twiml: sayAndGather({ text: agentText, actionUrl }),
    done: false,
  };
}

function handleStopIntent(state: InterviewState): ProcessResult {
  state.phase = "END";
  state.callEnded = true;
  state.endReason = "participant_stop";

  const text =
    "Understood, I appreciate your time. Let me just say thank you so much for sharing your thoughts today. Take care!";
  addAgentTurn(state, text);

  return {
    twiml: sayAndHangup(text),
    done: true,
  };
}

function addAgentTurn(
  state: InterviewState,
  text: string,
  pillarId?: string,
  lens?: string,
) {
  const turn: TurnRecord = {
    turnIndex: state.turns.length,
    speaker: "agent",
    text,
    pillarId: pillarId ?? null,
    lens: lens ?? null,
    phase: state.phase,
    timestampMs: Date.now() - state.callStartedAt,
  };
  state.turns.push(turn);
  state.totalTurnCount++;

  saveTurnToDb(state.sessionId, turn).catch((err) =>
    console.error("[db] Failed to save agent turn:", err),
  );
}

function addParticipantTurn(
  state: InterviewState,
  text: string,
  rawPayload?: Record<string, unknown>,
) {
  const pillar = state.pillars[state.currentPillarIndex];
  const turn: TurnRecord = {
    turnIndex: state.turns.length,
    speaker: "participant",
    text,
    pillarId: state.phase === "PILLAR_LOOP" ? (pillar?.id ?? null) : null,
    lens: null,
    phase: state.phase,
    timestampMs: Date.now() - state.callStartedAt,
  };
  state.turns.push(turn);
  state.totalTurnCount++;

  saveTurnToDb(state.sessionId, turn, rawPayload).catch((err) =>
    console.error("[db] Failed to save participant turn:", err),
  );
}

async function saveTurnToDb(
  sessionId: string,
  turn: TurnRecord,
  rawPayload?: Record<string, unknown>,
) {
  await supabase.from("turns").insert({
    session_id: sessionId,
    turn_index: turn.turnIndex,
    speaker: turn.speaker,
    pillar_id: turn.pillarId,
    lens: turn.lens,
    phase: turn.phase,
    prompt_text: turn.speaker === "agent" ? turn.text : null,
    response_text: turn.speaker === "participant" ? turn.text : null,
    start_ms: turn.timestampMs,
    end_ms: null,
    raw_twilio_payload: rawPayload ?? null,
  });
}
