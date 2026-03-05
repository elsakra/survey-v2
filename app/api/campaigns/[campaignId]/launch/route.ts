import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

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

  await inngest.send({
    name: "campaign/launch",
    data: { campaignId },
  });

  return NextResponse.json({ success: true, pendingContacts: count });
}
