import { createServiceClient } from "@/lib/supabase/server";
import {
  createVapiAssistant,
  createVapiOutboundCall,
  type CampaignPillarsJson,
} from "@/lib/vapi";

function getWebhookUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return `${base}/api/vapi/webhook`;
}

/**
 * Process a single contact: create session, call attempt, Vapi assistant,
 * and place the outbound call. The Vapi webhook handles call completion.
 */
export async function processContact(
  campaignId: string,
  contactId: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!contact || !campaign) {
    console.error("[direct-launch] contact or campaign not found", { contactId, campaignId });
    return;
  }

  if (campaign.status !== "active") {
    console.info("[direct-launch] campaign not active, skipping", { campaignId, status: campaign.status });
    return;
  }

  if (contact.status === "completed") return;
  if (contact.attempts >= contact.max_attempts) {
    await supabase.from("contacts").update({ status: "exhausted" }).eq("id", contactId);
    return;
  }

  const webhookUrl = getWebhookUrl();

  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({ campaign_id: campaignId, to_number: contact.phone, status: "pending" })
    .select()
    .single();
  if (sessErr || !session) {
    console.error("[direct-launch] session insert failed", sessErr);
    return;
  }

  const { data: attempt, error: attErr } = await supabase
    .from("call_attempts")
    .insert({
      contact_id: contactId,
      campaign_id: campaignId,
      attempt_num: contact.attempts + 1,
      status: "pending",
    })
    .select()
    .single();
  if (attErr || !attempt) {
    console.error("[direct-launch] attempt insert failed", attErr);
    return;
  }

  await supabase
    .from("contacts")
    .update({
      attempts: contact.attempts + 1,
      last_attempted_at: new Date().toISOString(),
      status: "attempted",
    })
    .eq("id", contactId);

  try {
    const assistant = await createVapiAssistant({
      pillarsJson: campaign.pillars_json as CampaignPillarsJson,
      maxDurationSec: campaign.max_duration_sec ?? undefined,
      instructions: campaign.instructions ?? undefined,
      openingSentence: campaign.opening_sentence ?? undefined,
      webhookUrl,
      channel: "outboundPhone",
    });

    const call = await createVapiOutboundCall({
      assistantId: assistant.id,
      to: contact.phone,
      sessionId: session.id,
      contactId,
      campaignId,
    });

    await supabase
      .from("call_attempts")
      .update({ call_id: call.id, status: "ringing" })
      .eq("id", attempt.id);

    await supabase
      .from("sessions")
      .update({ status: "in_progress" })
      .eq("id", session.id);

    console.info("[direct-launch] call placed", {
      campaignId,
      contactId,
      callId: call.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[direct-launch] call failed", { campaignId, contactId, error: msg });

    await supabase
      .from("call_attempts")
      .update({ status: "failed", error: msg })
      .eq("id", attempt.id);
    await supabase
      .from("sessions")
      .update({ status: "failed" })
      .eq("id", session.id);
    await supabase
      .from("contacts")
      .update({ status: "pending" })
      .eq("id", contactId);
  }
}

/**
 * Queue pending contacts for a campaign. Returns the contact list
 * so the caller can process them (e.g. via after()).
 */
export async function queueCampaignContacts(campaignId: string): Promise<{
  contacts: { id: string; phone: string }[];
  error?: string;
}> {
  const supabase = createServiceClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (error || !contacts || contacts.length === 0) {
    return { contacts: [], error: error?.message ?? "No pending contacts" };
  }

  await supabase
    .from("contacts")
    .update({ status: "queued" })
    .in(
      "id",
      contacts.map((c) => c.id),
    );

  console.info("[direct-launch] contacts queued", {
    campaignId,
    count: contacts.length,
  });

  return { contacts };
}
