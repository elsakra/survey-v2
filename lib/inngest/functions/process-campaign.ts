import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";

export const processCampaign = inngest.createFunction(
  { id: "process-campaign", retries: 1 },
  { event: "campaign/launch" },
  async ({ event, step }) => {
    const { campaignId } = event.data as { campaignId: string };

    const supabase = createServiceClient();

    const contacts = await step.run("fetch-contacts", async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, phone")
        .eq("campaign_id", campaignId)
        .eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    });

    if (contacts.length === 0) return { message: "No pending contacts" };

    await step.run("update-contacts-queued", async () => {
      const contactIds = contacts.map((c) => c.id);
      await supabase
        .from("contacts")
        .update({ status: "queued" })
        .in("id", contactIds);
    });

    const events = contacts.map((contact, i) => ({
      name: "call/make" as const,
      data: { contactId: contact.id, campaignId },
      ts: Date.now() + i * 5000,
    }));

    await step.sendEvent("schedule-calls", events);

    return { scheduled: contacts.length };
  },
);
