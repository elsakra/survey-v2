import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createVapiAssistant, type CampaignPillarsJson } from "@/lib/vapi";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { code: "unauthorized", message: "Please sign in again." },
        { status: 401 },
      );
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { code: "campaign_not_found", message: "Campaign not found." },
        { status: 404 },
      );
    }

    const pillarsJson = campaign.pillars_json as CampaignPillarsJson;
    const assistant = await createVapiAssistant({
      pillarsJson,
      maxDurationSec: campaign.max_duration_sec ?? undefined,
      instructions: campaign.instructions ?? undefined,
      openingSentence: campaign.opening_sentence ?? undefined,
    });

    return NextResponse.json({ assistantId: assistant.id });
  } catch (error: any) {
    console.error("[campaign assistant] Failed:", error);
    return NextResponse.json(
      {
        code: "assistant_create_failed",
        message: "Unable to start test interview right now. Please try again.",
        details: error?.message ?? "unknown error",
      },
      { status: 502 },
    );
  }
}
