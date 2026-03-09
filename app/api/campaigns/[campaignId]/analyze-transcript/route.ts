import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { extractPillarInsights } from "@/lib/analysis/extract-pillar-insights";
import type { CampaignPillarsJson } from "@/lib/vapi";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const transcript = body?.transcript;
    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 20) {
      return NextResponse.json(
        { error: "Transcript text is required (minimum 20 characters)" },
        { status: 400 },
      );
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("pillars_json")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const pillars = campaign.pillars_json as CampaignPillarsJson;
    if (!pillars?.pillars?.length) {
      return NextResponse.json(
        { error: "Campaign has no pillar questions configured" },
        { status: 400 },
      );
    }

    const analysis = await extractPillarInsights(transcript.trim(), pillars);
    return NextResponse.json(analysis);
  } catch (err: any) {
    console.error("[analyze-transcript] Error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Analysis failed" },
      { status: 500 },
    );
  }
}
