import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { TranscriptAnalysis, PillarInsight } from "@/lib/analysis/extract-pillar-insights";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, user_id, pillars_json")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: completedSessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "completed");

  const sessionIds = (completedSessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) {
    return NextResponse.json({ error: "No completed interviews yet" }, { status: 400 });
  }

  const { data: analysisRows } = await supabase
    .from("transcripts")
    .select("content_json")
    .in("session_id", sessionIds)
    .eq("type", "pillar_analysis");

  const analyses: TranscriptAnalysis[] = (analysisRows ?? [])
    .map((r) => {
      const cj = r.content_json;
      if (typeof cj === "string") {
        try { return JSON.parse(cj); } catch { return null; }
      }
      return cj;
    })
    .filter(Boolean) as TranscriptAnalysis[];

  if (analyses.length === 0) {
    return NextResponse.json({ error: "No analyzed interviews yet" }, { status: 400 });
  }

  const pillarMap = new Map<
    string,
    {
      question: string;
      answeredCount: number;
      totalCount: number;
      sentiments: Record<string, number>;
      depths: Record<string, number>;
      allAnswers: string[];
      allQuotes: string[];
    }
  >();

  for (const a of analyses) {
    for (const p of a.pillars) {
      let entry = pillarMap.get(p.pillarId);
      if (!entry) {
        entry = {
          question: p.question,
          answeredCount: 0,
          totalCount: 0,
          sentiments: {},
          depths: {},
          allAnswers: [],
          allQuotes: [],
        };
        pillarMap.set(p.pillarId, entry);
      }
      entry.totalCount++;
      if (p.answered) {
        entry.answeredCount++;
        entry.allAnswers.push(p.participantAnswer);
        entry.allQuotes.push(...p.keyQuotes);
      }
      entry.sentiments[p.sentiment] = (entry.sentiments[p.sentiment] ?? 0) + 1;
      entry.depths[p.depth] = (entry.depths[p.depth] ?? 0) + 1;
    }
  }

  const pillarSummaries = Array.from(pillarMap.entries()).map(([id, entry]) => ({
    pillarId: id,
    question: entry.question,
    coverage: `${entry.answeredCount}/${entry.totalCount}`,
    coveragePercent: Math.round((entry.answeredCount / entry.totalCount) * 100),
    sentimentDistribution: entry.sentiments,
    depthDistribution: entry.depths,
    sampleQuotes: entry.allQuotes.slice(0, 5),
  }));

  const allThemes = analyses.flatMap((a) => a.overallThemes);
  const themeCounts = new Map<string, number>();
  for (const theme of allThemes) {
    const normalized = theme.toLowerCase().trim();
    themeCounts.set(normalized, (themeCounts.get(normalized) ?? 0) + 1);
  }
  const topThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([theme, count]) => ({ theme, count }));

  const engagementCounts: Record<string, number> = {};
  for (const a of analyses) {
    engagementCounts[a.participantEngagement] =
      (engagementCounts[a.participantEngagement] ?? 0) + 1;
  }

  const qualityCounts = {
    consentObtained: 0,
    allPillarsAddressed: 0,
    endedCleanly: 0,
    interviewerStayedNeutral: 0,
  };
  for (const a of analyses) {
    if (a.callQuality.consentObtained) qualityCounts.consentObtained++;
    if (a.callQuality.allPillarsAddressed) qualityCounts.allPillarsAddressed++;
    if (a.callQuality.endedCleanly) qualityCounts.endedCleanly++;
    if (a.callQuality.interviewerStayedNeutral) qualityCounts.interviewerStayedNeutral++;
  }

  const allNotableQuotes = analyses.flatMap((a) => a.notableQuotes).slice(0, 10);

  return NextResponse.json({
    campaignId,
    interviewsAnalyzed: analyses.length,
    completedSessions: sessionIds.length,
    pillars: pillarSummaries,
    topThemes,
    engagementDistribution: engagementCounts,
    callQualityRates: {
      consentObtained: `${qualityCounts.consentObtained}/${analyses.length}`,
      allPillarsAddressed: `${qualityCounts.allPillarsAddressed}/${analyses.length}`,
      endedCleanly: `${qualityCounts.endedCleanly}/${analyses.length}`,
      interviewerStayedNeutral: `${qualityCounts.interviewerStayedNeutral}/${analyses.length}`,
    },
    notableQuotes: allNotableQuotes,
  });
}
