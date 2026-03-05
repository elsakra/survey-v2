import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processCampaign } from "@/lib/inngest/functions/process-campaign";
import { makeCall } from "@/lib/inngest/functions/make-call";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processCampaign, makeCall],
});
