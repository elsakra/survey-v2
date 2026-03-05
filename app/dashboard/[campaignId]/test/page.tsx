import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VoiceTest } from "@/components/voice-test";

export default async function TestPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", user!.id)
    .single();

  if (!campaign) notFound();

  const pillars = campaign.pillars_json?.pillars ?? [];

  return (
    <div className="max-w-2xl">
      <Link
        href={`/dashboard/${campaignId}`}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
      >
        &larr; Back to campaign
      </Link>
      <h1 className="text-2xl font-semibold mb-2">Test Interview</h1>
      <p className="text-sm text-gray-500 mb-6">
        Talk to the AI interviewer through your browser to test and refine your campaign
        configuration before launching calls.
      </p>

      <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wider mb-3">
          Before You Start
        </h2>
        <ol className="list-decimal list-inside text-sm text-blue-900 space-y-1">
          <li>Use Chrome or Edge on desktop.</li>
          <li>Allow microphone access when prompted.</li>
          <li>Make sure your mic is not muted and volume is up.</li>
        </ol>
        <div className="mt-4 text-sm text-blue-800 space-y-1">
          <p>
            <span className="font-medium">Success looks like:</span> the status shows
            <span className="font-semibold"> Live</span> and you see transcript turns below.
          </p>
          <p>
            <span className="font-medium">If it fails:</span> read the error card and follow the suggested fix, then click
            <span className="font-semibold"> Test Again</span>.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Current Configuration</h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>
            <span className="font-medium text-gray-600">Title:</span>{" "}
            {campaign.title ?? campaign.pillars_json?.title ?? "Untitled"}
          </li>
          <li>
            <span className="font-medium text-gray-600">Pillars:</span>{" "}
            {pillars.map((p: any) => p.question).join(" | ")}
          </li>
          {campaign.pillars_json?.context && (
            <li>
              <span className="font-medium text-gray-600">Context:</span>{" "}
              {campaign.pillars_json.context}
            </li>
          )}
          {campaign.max_duration_sec && (
            <li>
              <span className="font-medium text-gray-600">Max duration:</span>{" "}
              {campaign.max_duration_sec}s
            </li>
          )}
          {campaign.opening_sentence && (
            <li>
              <span className="font-medium text-gray-600">Opening sentence (verbatim):</span>{" "}
              {campaign.opening_sentence}
            </li>
          )}
        </ul>
      </div>

      <VoiceTest campaignId={campaignId} allowSkip={campaign.status === "draft"} />
    </div>
  );
}
