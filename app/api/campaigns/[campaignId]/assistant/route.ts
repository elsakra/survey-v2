import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createVapiAssistant, type CampaignPillarsJson } from "@/lib/vapi";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pillarsJson = campaign.pillars_json as CampaignPillarsJson;
  const assistant = await createVapiAssistant({
    pillarsJson,
    instructions: campaign.instructions ?? undefined,
  });

  return NextResponse.json({ assistantId: assistant.id });
}
