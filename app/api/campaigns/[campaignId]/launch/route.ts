import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { extractInngestEventIds } from "@/lib/inngest/send-result";

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
    const sendResult = await inngest.send({
      name: "campaign/launch",
      data: { campaignId },
    });
    console.info("[campaign launch] inngest.send raw result", {
      campaignId,
      sendResult: JSON.stringify(sendResult),
      type: typeof sendResult,
    });
    const eventIds = extractInngestEventIds(sendResult);
    if (eventIds.length === 0) {
      console.error("[campaign launch] Inngest send missing event IDs", {
        campaignId,
        sendResult: JSON.stringify(sendResult),
      });
      const { error: rollbackError } = await supabase
        .from("campaigns")
        .update({ status: "draft" })
        .eq("id", campaignId);
      if (rollbackError) {
        console.error("[campaign launch] Failed to rollback campaign status", {
          campaignId,
          error: rollbackError.message,
        });
      }
      return NextResponse.json(
        { error: "Launch enqueue was not acknowledged by Inngest. Please retry." },
        { status: 502 },
      );
    }

    console.info("[campaign launch] Enqueue acknowledged", {
      campaignId,
      eventIds,
      pendingContacts: count,
    });

    return NextResponse.json({ success: true, pendingContacts: count, eventIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[campaign launch] Inngest send failed", {
      campaignId,
      error: message,
    });
    // Roll back status so UI reflects that launch did not fully start.
    const { error: rollbackError } = await supabase
      .from("campaigns")
      .update({ status: "draft" })
      .eq("id", campaignId);
    if (rollbackError) {
      console.error("[campaign launch] Failed to rollback campaign status", {
        campaignId,
        error: rollbackError.message,
      });
    }
    return NextResponse.json(
      { error: "Failed to enqueue campaign launch in Inngest. Please retry." },
      { status: 502 },
    );
  }
}
