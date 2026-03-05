import type { Pillar, PillarsConfig } from "../db/types.js";

export type Phase =
  | "CONSENT"
  | "WARMUP"
  | "PILLAR_LOOP"
  | "WRAPUP"
  | "END";

export type Speaker = "agent" | "participant";

export type Lens =
  | "Clarify"
  | "Example"
  | "Steps"
  | "Tradeoffs"
  | "Quantify"
  | "Exceptions"
  | "Counterfactual";

export const ALL_LENSES: Lens[] = [
  "Clarify",
  "Example",
  "Steps",
  "Tradeoffs",
  "Quantify",
  "Exceptions",
  "Counterfactual",
];

export interface PillarEvidence {
  incident: 0 | 1;
  mechanism: 0 | 1;
  boundary: 0 | 1;
  quant: 0 | 1;
}

export interface AssessorOutput {
  coverage: PillarEvidence;
  novelty_score: number;
  boredom_risk: number;
  next_action: "FOLLOWUP" | "NEXT_PILLAR" | "WRAPUP";
  recommended_lens: Lens;
  missing: string[];
}

export interface TurnRecord {
  turnIndex: number;
  speaker: Speaker;
  text: string;
  pillarId: string | null;
  lens: string | null;
  phase: Phase;
  timestampMs: number;
}

export interface InterviewState {
  sessionId: string;
  callSid: string | null;
  phase: Phase;

  pillarsConfig: PillarsConfig;
  pillars: Pillar[];
  currentPillarIndex: number;
  warmupTurnCount: number;

  pillarFollowUpCount: Map<string, number>;
  pillarEvidence: Map<string, PillarEvidence>;
  pillarLensesUsed: Map<string, Lens[]>;

  turns: TurnRecord[];
  totalTurnCount: number;
  silenceCount: number;
  lastAgentText: string;

  callStartedAt: number;
  durationSec: number;
  pillarTimeboxMs: number;
  pillarStartedAt: number;

  consentReceived: boolean;
  callEnded: boolean;
  endReason: string | null;
}

const MAX_TOTAL_TURNS = 40;
const MAX_PILLAR_TURNS = 10;
const WARMUP_MS = 60_000;
const WRAPUP_MS = 90_000;

export function createInitialState(
  sessionId: string,
  config: PillarsConfig,
  durationSec: number,
): InterviewState {
  const pillars = config.pillars;
  const totalMs = durationSec * 1000;
  const pillarTimeboxMs = Math.floor(
    (totalMs - WARMUP_MS - WRAPUP_MS) / pillars.length,
  );

  const state: InterviewState = {
    sessionId,
    callSid: null,
    phase: "CONSENT",

    pillarsConfig: config,
    pillars,
    currentPillarIndex: 0,
    warmupTurnCount: 0,

    pillarFollowUpCount: new Map(),
    pillarEvidence: new Map(),
    pillarLensesUsed: new Map(),

    turns: [],
    totalTurnCount: 0,
    silenceCount: 0,
    lastAgentText: "",

    callStartedAt: Date.now(),
    durationSec,
    pillarTimeboxMs,
    pillarStartedAt: 0,

    consentReceived: false,
    callEnded: false,
    endReason: null,
  };

  for (const p of pillars) {
    state.pillarFollowUpCount.set(p.id, 0);
    state.pillarEvidence.set(p.id, {
      incident: 0,
      mechanism: 0,
      boundary: 0,
      quant: 0,
    });
    state.pillarLensesUsed.set(p.id, []);
  }

  return state;
}

export function isTimedOut(state: InterviewState): boolean {
  const elapsed = Date.now() - state.callStartedAt;
  return elapsed >= state.durationSec * 1000;
}

export function isPillarTimedOut(state: InterviewState): boolean {
  if (state.pillarStartedAt === 0) return false;
  return Date.now() - state.pillarStartedAt >= state.pillarTimeboxMs;
}

export function isTurnCapped(state: InterviewState): boolean {
  return state.totalTurnCount >= MAX_TOTAL_TURNS;
}

export function isPillarTurnCapped(state: InterviewState): boolean {
  const pid = state.pillars[state.currentPillarIndex]?.id;
  if (!pid) return true;
  return (state.pillarFollowUpCount.get(pid) ?? 0) >= MAX_PILLAR_TURNS;
}

export function evidenceSufficient(evidence: PillarEvidence): boolean {
  const total =
    evidence.incident + evidence.mechanism + evidence.boundary + evidence.quant;
  return total >= 3 && evidence.incident === 1;
}

const STOP_WORDS = [
  "stop",
  "not interested",
  "too many questions",
  "end the call",
  "i'm done",
  "that's enough",
  "hang up",
  "no more questions",
  "i have to go",
  "i need to go",
];

export function detectStopIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return STOP_WORDS.some((w) => lower.includes(w));
}

export function detectConsentResponse(
  speechResult: string | undefined,
): "yes" | "no" | "unclear" {
  if (speechResult) {
    const lower = speechResult.toLowerCase().trim();
    if (
      lower.includes("yes") ||
      lower.includes("sure") ||
      lower.includes("okay") ||
      lower.includes("go ahead") ||
      lower.includes("i consent") ||
      lower.includes("that's fine")
    )
      return "yes";
    if (
      lower.includes("no") ||
      lower.includes("don't") ||
      lower.includes("do not") ||
      lower.includes("refuse")
    )
      return "no";
  }

  return "unclear";
}

export { MAX_TOTAL_TURNS, MAX_PILLAR_TURNS };
