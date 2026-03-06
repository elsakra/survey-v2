import { serve } from "inngest/next";
import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { processCampaign } from "@/lib/inngest/functions/process-campaign";
import { makeCall } from "@/lib/inngest/functions/make-call";

const functions = [processCampaign, makeCall];

const inngestHandler = serve({
  client: inngest,
  functions,
});

export async function GET(request: NextRequest, context: unknown) {
  const url = new URL(request.url);
  if (url.searchParams.get("diagnostics") === "1") {
    const diagnostics = {
      app: "survey-v2",
      hasEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
      hasSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
      functionCount: functions.length,
      functionIds: functions.map((fn) => (typeof fn.id === "function" ? fn.id() : fn.id)),
      isVercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? "unknown",
    };
    console.info("[inngest diagnostics]", diagnostics);
    return NextResponse.json(diagnostics);
  }
  if (url.searchParams.get("test-send") === "1") {
    try {
      const sendResult = await inngest.send({
        name: "campaign/launch",
        data: { campaignId: "00000000-0000-0000-0000-000000000000" },
      });
      console.info("[inngest test-send] result:", JSON.stringify(sendResult));
      return NextResponse.json({ success: true, sendResult });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[inngest test-send] error:", msg);
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  }
  return inngestHandler.GET(request, context);
}

export const POST = inngestHandler.POST;
export const PUT = inngestHandler.PUT;
