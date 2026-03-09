import OpenAI from "openai";
import type { CampaignPillarsJson } from "@/lib/vapi";

export interface PillarInsight {
  pillarId: string;
  question: string;
  answered: boolean;
  participantAnswer: string;
  keyQuotes: string[];
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  depth: "surface" | "moderate" | "deep";
}

export interface TranscriptAnalysis {
  pillars: PillarInsight[];
  overallThemes: string[];
  notableQuotes: string[];
  participantEngagement: "high" | "moderate" | "low" | "disengaged";
  callQuality: {
    consentObtained: boolean;
    allPillarsAddressed: boolean;
    endedCleanly: boolean;
    interviewerStayedNeutral: boolean;
  };
}

const EXTRACTION_PROMPT = `You are an expert qualitative research analyst. Given an interview transcript and the list of pillar questions the interviewer was supposed to cover, extract structured insights.

Return a JSON object with this exact schema:

{
  "pillars": [
    {
      "pillarId": "<the pillar ID>",
      "question": "<the pillar question>",
      "answered": true/false,
      "participantAnswer": "<synthesized 1-3 sentence summary of what the participant said about this topic>",
      "keyQuotes": ["<verbatim quote from participant>", ...],
      "sentiment": "positive" | "negative" | "neutral" | "mixed",
      "depth": "surface" | "moderate" | "deep"
    }
  ],
  "overallThemes": ["<theme 1>", "<theme 2>", ...],
  "notableQuotes": ["<most impactful verbatim quotes across all topics>"],
  "participantEngagement": "high" | "moderate" | "low" | "disengaged",
  "callQuality": {
    "consentObtained": true/false,
    "allPillarsAddressed": true/false,
    "endedCleanly": true/false,
    "interviewerStayedNeutral": true/false
  }
}

Rules:
- "keyQuotes" must be EXACT verbatim text from the participant, not paraphrased
- "participantAnswer" is your synthesis of everything the participant said relevant to that pillar
- "depth" is "surface" if only a yes/no or single sentence, "moderate" if some elaboration, "deep" if concrete examples/stories/numbers
- "sentiment" reflects the participant's emotional tone about that topic
- "overallThemes" are cross-cutting themes you notice across all pillars (2-4 themes)
- "notableQuotes" are the 2-5 most insightful or revealing verbatim participant quotes from the entire interview
- For "callQuality", evaluate whether the interviewer obtained consent, addressed all pillars, ended the call cleanly, and stayed neutral throughout
- Include ALL pillars from the list, even if they were not addressed (set answered=false)`;

export async function extractPillarInsights(
  transcript: string,
  pillars: CampaignPillarsJson,
): Promise<TranscriptAnalysis> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const pillarList = pillars.pillars
    .map((p) => `- [${p.id}] "${p.question}"${p.context ? ` (Context: ${p.context})` : ""}`)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `## Pillar Questions\n${pillarList}\n\n## Interview Transcript\n${transcript}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI");

  const parsed = JSON.parse(raw) as TranscriptAnalysis;
  return parsed;
}
