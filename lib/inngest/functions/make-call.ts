import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/server";
import { createVapiAssistant, createVapiOutboundCall, getVapiCall, type CampaignPillarsJson } from "@/lib/vapi";

function isWithinCallingHours(callingHours: any): boolean {
  if (!callingHours?.timezone || !callingHours?.start || !callingHours?.end) return true;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: callingHours.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(now);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const currentTime = `${hour}:${minute}`;

    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayPart = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const dayNum = dayMap[dayPart] ?? 1;

    if (callingHours.days && !callingHours.days.includes(dayNum)) return false;
    if (currentTime < callingHours.start || currentTime >= callingHours.end) return false;
    return true;
  } catch {
    return true;
  }
}

export const makeCall = inngest.createFunction(
  {
    id: "make-call",
    retries: 2,
    concurrency: [{ limit: 5 }],
  },
  { event: "call/make" },
  async ({ event, step }) => {
    const { contactId, campaignId } = event.data as {
      contactId: string;
      campaignId: string;
    };

    const supabase = createServiceClient();

    const { contact, campaign } = await step.run("load-data", async () => {
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
      if (!contact || !campaign) throw new Error("Contact or campaign not found");
      return { contact, campaign };
    });

    if (campaign.status === "paused") {
      await step.run("reset-queued-on-pause", async () => {
        if (contact.status === "queued") {
          await supabase
            .from("contacts")
            .update({ status: "pending" })
            .eq("id", contactId);
        }
      });
      return { paused: true };
    }

    if (campaign.status !== "active") {
      return { skipped: true, reason: `campaign_status_${campaign.status}` };
    }

    if (contact.status === "completed") return { skipped: true };
    if (contact.attempts >= contact.max_attempts) {
      await step.run("mark-exhausted", async () => {
        await supabase
          .from("contacts")
          .update({ status: "exhausted" })
          .eq("id", contactId);
      });
      return { exhausted: true };
    }

    if (!isWithinCallingHours(campaign.calling_hours)) {
      await step.sleep("wait-for-hours", "30m");
      await step.sendEvent("reschedule", {
        name: "call/make",
        data: { contactId, campaignId },
      });
      return { rescheduled: true };
    }

    const { sessionId, attemptId, assistantId } = await step.run("setup-call", async () => {
      const { data: session, error: sessErr } = await supabase
        .from("sessions")
        .insert({
          campaign_id: campaignId,
          to_number: contact.phone,
          status: "pending",
        })
        .select()
        .single();
      if (sessErr) throw sessErr;

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
      if (attErr) throw attErr;

      await supabase
        .from("contacts")
        .update({
          attempts: contact.attempts + 1,
          last_attempted_at: new Date().toISOString(),
          status: "attempted",
        })
        .eq("id", contactId);

      const base = process.env.NEXT_PUBLIC_APP_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const webhookUrl = `${base}/api/vapi/webhook`;

      const assistant = await createVapiAssistant({
        pillarsJson: campaign.pillars_json as CampaignPillarsJson,
        maxDurationSec: campaign.max_duration_sec ?? undefined,
        instructions: campaign.instructions ?? undefined,
        openingSentence: campaign.opening_sentence ?? undefined,
        webhookUrl,
        channel: "outboundPhone",
      });

      return { sessionId: session.id, attemptId: attempt.id, assistantId: assistant.id };
    });

    const callResult = await step.run("place-call", async () => {
      const call = await createVapiOutboundCall({
        assistantId,
        to: contact.phone,
        sessionId,
        contactId,
        campaignId,
      });

      await supabase
        .from("call_attempts")
        .update({ call_id: call.id, status: "ringing" })
        .eq("id", attemptId);

      await supabase
        .from("sessions")
        .update({ status: "in_progress" })
        .eq("id", sessionId);

      return { callId: call.id };
    });

    await step.sleep("wait-for-call", "8m");

    const finalStatus = await step.run("check-call-status", async () => {
      const callData = await getVapiCall(callResult.callId);
      const status = callData.status ?? "unknown";
      const ended = status === "ended";

      await supabase
        .from("call_attempts")
        .update({
          status: ended ? "completed" : status,
          ended_at: callData.endedAt ?? new Date().toISOString(),
          session_id: sessionId,
        })
        .eq("id", attemptId);

      if (ended) {
        await supabase
          .from("contacts")
          .update({ status: "completed", session_id: sessionId })
          .eq("id", contactId);
        await supabase
          .from("sessions")
          .update({ status: "completed" })
          .eq("id", sessionId);
      } else {
        await supabase
          .from("call_attempts")
          .update({ status: "failed", error: `Call status: ${status}` })
          .eq("id", attemptId);

        if (contact.attempts + 1 < contact.max_attempts) {
          await supabase
            .from("contacts")
            .update({ status: "pending" })
            .eq("id", contactId);
        } else {
          await supabase
            .from("contacts")
            .update({ status: "exhausted" })
            .eq("id", contactId);
        }
      }

      return status;
    });

    return { callId: callResult.callId, status: finalStatus };
  },
);
