import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { launchCampaignDirect } from "@/lib/campaign/direct-launch";

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
    .select("id, status, user_id")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Campaign already launched" }, { status: 400 });
  }

  const { count } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (!count || count === 0) {
    return NextResponse.json({ error: "No pending contacts" }, { status: 400 });
  }

  const { error: activateError } = await supabase
    .from("campaigns")
    .update({ status: "active" })
    .eq("id", campaignId);

  if (activateError) {
    console.error("[campaign launch] Failed to set campaign active", {
      campaignId,
      error: activateError.message,
    });
    return NextResponse.json({ error: "Failed to launch campaign" }, { status: 500 });
  }

  try {
    const result = await launchCampaignDirect(campaignId);

    if (result.error) {
      console.error("[campaign launch] direct launch error", { campaignId, error: result.error });
      await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaignId);
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    console.info("[campaign launch] direct launch started", {
      campaignId,
      scheduled: result.scheduled,
    });

    return NextResponse.json({
      success: true,
      pendingContacts: count,
      scheduled: result.scheduled,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[campaign launch] direct launch failed", { campaignId, error: message });
    await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaignId);
    return NextResponse.json({ error: "Failed to launch campaign. Please retry." }, { status: 502 });
  }
}
