import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action;

    if (action !== "completed" && action !== "skipped") {
      return NextResponse.json(
        { error: "Invalid action. Use 'completed' or 'skipped'." },
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

    const now = new Date().toISOString();
    const update =
      action === "completed"
        ? { test_completed_at: now }
        : { test_skipped_at: now };

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .update(update)
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .eq("status", "draft")
      .select("id, test_completed_at, test_skipped_at")
      .single();

    if (error || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found or no longer editable." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    console.error("[campaign test-status] Failed:", error);
    return NextResponse.json({ error: "Failed to update test status." }, { status: 500 });
  }
}

