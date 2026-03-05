import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { extractInngestEventIds } from "@/lib/inngest/send-result";

type CampaignAction = "pause" | "resume" | "restart";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: CampaignAction };
    const action = body.action;

    if (!action || !["pause", "resume", "restart"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Use pause, resume, or restart." },
        { status: 400 },
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, status, user_id")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "pause") {
      if (campaign.status !== "active" && campaign.status !== "paused") {
        return NextResponse.json(
          { error: "Only active campaigns can be paused." },
          { status: 400 },
        );
      }

      const service = createServiceClient();

      await service
        .from("campaigns")
        .update({ status: "paused" })
        .eq("id", campaignId);

      // Release queued contacts back to pending so resume/restart can re-schedule cleanly.
      await service
        .from("contacts")
        .update({ status: "pending" })
        .eq("campaign_id", campaignId)
        .eq("status", "queued");

      return NextResponse.json({ success: true, status: "paused" });
    }

    if (campaign.status !== "paused" && campaign.status !== "active") {
      return NextResponse.json(
        { error: "Only paused or active campaigns can be resumed/restarted." },
        { status: 400 },
      );
    }

    const { error: activateError } = await supabase
      .from("campaigns")
      .update({ status: "active" })
      .eq("id", campaignId);
    if (activateError) {
      console.error("[campaign status] Failed to set campaign active", {
        campaignId,
        action,
        error: activateError.message,
      });
      return NextResponse.json({ error: "Failed to update campaign status." }, { status: 500 });
    }

    try {
      const sendResult = await inngest.send({
        name: "campaign/launch",
        data: { campaignId },
      });
      const eventIds = extractInngestEventIds(sendResult);
      if (eventIds.length === 0) {
        console.error("[campaign status] Inngest send missing event IDs", {
          campaignId,
          action,
          sendResult,
        });
        const rollbackStatus = campaign.status === "paused" ? "paused" : "active";
        const { error: rollbackError } = await supabase
          .from("campaigns")
          .update({ status: rollbackStatus })
          .eq("id", campaignId);
        if (rollbackError) {
          console.error("[campaign status] Failed to rollback campaign status", {
            campaignId,
            action,
            error: rollbackError.message,
          });
        }
        return NextResponse.json(
          { error: "Resume/restart enqueue was not acknowledged by Inngest. Please retry." },
          { status: 502 },
        );
      }

      console.info("[campaign status] Enqueue acknowledged", {
        campaignId,
        action,
        eventIds,
      });
      return NextResponse.json({ success: true, status: "active", eventIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[campaign status] Inngest send failed", {
        campaignId,
        action,
        error: message,
      });
      const rollbackStatus = campaign.status === "paused" ? "paused" : "active";
      const { error: rollbackError } = await supabase
        .from("campaigns")
        .update({ status: rollbackStatus })
        .eq("id", campaignId);
      if (rollbackError) {
        console.error("[campaign status] Failed to rollback campaign status", {
          campaignId,
          action,
          error: rollbackError.message,
        });
      }
      return NextResponse.json(
        { error: "Failed to enqueue resume/restart in Inngest. Please retry." },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("[campaign status] Failed:", error);
    return NextResponse.json(
      { error: "Failed to update campaign status." },
      { status: 500 },
    );
  }
}

