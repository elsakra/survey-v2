import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { extractPillarInsights } from "@/lib/analysis/extract-pillar-insights";
import type { CampaignPillarsJson } from "@/lib/vapi";

export const analyzeCall = inngest.createFunction(
  { id: "analyze-call", retries: 2 },
  { event: "call/analyze" },
  async ({ event, step }) => {
    const { sessionId, campaignId } = event.data as {
      sessionId: string;
      campaignId: string;
    };

    const supabase = createServiceClient();

    const { transcript, pillarsJson } = await step.run("load-data", async () => {
      const { data: rows } = await supabase
        .from("transcripts")
        .select("type, content_json")
        .eq("session_id", sessionId)
        .eq("type", "plain_text")
        .limit(1);

      const row = rows?.[0];
      if (!row) throw new Error(`No plain_text transcript for session ${sessionId}`);

      const content = row.content_json;
      const text = typeof content === "string" ? content : content?.text ?? "";
      if (!text) throw new Error("Transcript text is empty");

      const { data: campaign } = await supabase
        .from("campaigns")
        .select("pillars_json")
        .eq("id", campaignId)
        .single();

      if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

      return {
        transcript: text as string,
        pillarsJson: campaign.pillars_json as CampaignPillarsJson,
      };
    });

    const analysis = await step.run("extract-insights", async () => {
      return extractPillarInsights(transcript, pillarsJson);
    });

    await step.run("store-analysis", async () => {
      const existing = await supabase
        .from("transcripts")
        .select("id")
        .eq("session_id", sessionId)
        .eq("type", "pillar_analysis")
        .limit(1);

      if (existing.data && existing.data.length > 0) {
        await supabase
          .from("transcripts")
          .update({ content_json: analysis })
          .eq("id", existing.data[0].id);
      } else {
        const { error } = await supabase.from("transcripts").insert({
          session_id: sessionId,
          type: "pillar_analysis",
          content_json: analysis,
        });
        if (error) throw error;
      }
    });

    console.info("[analyze-call] done", {
      sessionId,
      campaignId,
      pillarCount: analysis.pillars.length,
    });

    return { sessionId, pillarCount: analysis.pillars.length };
  },
);
