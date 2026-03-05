import type { InterviewState } from "../orchestrator/state.js";

export function buildAssessorPrompt(
  state: InterviewState,
  participantResponse: string,
): { system: string; user: string } {
  const pillar = state.pillars[state.currentPillarIndex];
  const evidence = state.pillarEvidence.get(pillar?.id ?? "") ?? {
    incident: 0,
    mechanism: 0,
    boundary: 0,
    quant: 0,
  };
  const lensesUsed = state.pillarLensesUsed.get(pillar?.id ?? "") ?? [];
  const lastLens = lensesUsed[lensesUsed.length - 1];
  const followUpCount = state.pillarFollowUpCount.get(pillar?.id ?? "") ?? 0;

  const recentTurns = state.turns
    .filter((t) => t.pillarId === pillar?.id)
    .slice(-8)
    .map(
      (t) =>
        `${t.speaker === "agent" ? "Interviewer" : "Participant"}: ${t.text}`,
    )
    .join("\n");

  const system = `You are an interview quality assessor. Your job is to evaluate the participant's latest response against a structured evidence checklist and recommend the next action.

You MUST respond with valid JSON only. No other text.

OUTPUT SCHEMA (strict):
{
  "coverage": {
    "incident": 0 or 1 (has the participant described at least one concrete, recent, specific example?),
    "mechanism": 0 or 1 (has the participant explained WHY / decision criteria / tradeoffs?),
    "boundary": 0 or 1 (has the participant described an exception or counterexample?),
    "quant": 0 or 1 (has the participant given any number, frequency, or metric, OR said they can't quantify?)
  },
  "novelty_score": 0.0 to 1.0 (how much NEW information did this response add? 0=nothing new, 1=very novel),
  "boredom_risk": 0.0 to 1.0 (risk the participant is getting fatigued/bored/annoyed. Signs: shorter answers, repetition, irritation words, "I already said"),
  "next_action": "FOLLOWUP" or "NEXT_PILLAR" or "WRAPUP",
  "recommended_lens": one of "Clarify", "Example", "Steps", "Tradeoffs", "Quantify", "Exceptions", "Counterfactual",
  "missing": array of strings from ["incident", "mechanism", "boundary", "quant"] that are still 0
}

RULES for next_action:
- "FOLLOWUP" if coverage < 3 of 4 AND incident is 0 AND boredom_risk < 0.7 AND participant seems engaged
- "NEXT_PILLAR" if coverage >= 3 of 4 (with incident=1) OR boredom_risk >= 0.7 OR novelty_score < 0.2 for 2+ turns
- "WRAPUP" if all pillars would be exhausted (only return this if we're on the last pillar and coverage is sufficient)

RULES for recommended_lens:
- Do NOT recommend "${lastLens ?? "none"}" (that was the last lens used)
- Pick the lens that would best fill the MISSING evidence
- If incident is missing, prefer "Example"
- If mechanism is missing, prefer "Tradeoffs" or "Steps"
- If boundary is missing, prefer "Exceptions" or "Counterfactual"
- If quant is missing, prefer "Quantify"`;

  const user = `PILLAR: "${pillar?.question ?? ""}"
FOLLOW-UPS ASKED SO FAR: ${followUpCount}
CURRENT EVIDENCE: ${JSON.stringify(evidence)}

CONVERSATION ON THIS PILLAR:
${recentTurns}

LATEST PARTICIPANT RESPONSE:
"${participantResponse}"

Assess and respond with JSON only.`;

  return { system, user };
}
