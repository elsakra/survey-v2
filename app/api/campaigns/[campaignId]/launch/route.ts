import { NextResponse } from "next/server";
import { after } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { queueCampaignContacts, processContact } from "@/lib/campaign/direct-launch";

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
    const result = await queueCampaignContacts(campaignId);

    if (result.error || result.contacts.length === 0) {
      console.error("[campaign launch] queue error", { campaignId, error: result.error });
      await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaignId);
      return NextResponse.json({ error: result.error ?? "No contacts to call" }, { status: 502 });
    }

    after(async () => {
      console.info("[campaign launch] after() processing contacts", {
        campaignId,
        count: result.contacts.length,
      });
      for (const contact of result.contacts) {
        try {
          await processContact(campaignId, contact.id);
        } catch (err) {
          console.error("[campaign launch] after() contact error", {
            contactId: contact.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      console.info("[campaign launch] after() done", { campaignId });
    });

    console.info("[campaign launch] responding with scheduled count", {
      campaignId,
      scheduled: result.contacts.length,
    });

    return NextResponse.json({
      success: true,
      pendingContacts: count,
      scheduled: result.contacts.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[campaign launch] direct launch failed", { campaignId, error: message });
    await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaignId);
    return NextResponse.json({ error: "Failed to launch campaign. Please retry." }, { status: 502 });
  }
}
