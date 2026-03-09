import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VoiceTest } from "@/components/voice-test";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Alert } from "@/components/ui/alert";

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
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/dashboard/${campaignId}`}
        className="inline-block text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        &larr; Back to campaign
      </Link>
      <SectionHeader
        title="Test Interview"
        description="Run a live browser call to validate interviewer behavior and transcript analysis before launch."
      />

      <Alert variant="info">
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
      </Alert>

      <Card>
        <CardBody>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Current Configuration</h3>
          <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]">
          <li>
            <span className="font-medium text-[var(--color-text-primary)]">Title:</span>{" "}
            {campaign.title ?? campaign.pillars_json?.title ?? "Untitled"}
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-primary)]">Pillars:</span>{" "}
            {pillars.map((p: any) => p.question).join(" | ")}
          </li>
          {campaign.pillars_json?.context && (
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Context:</span>{" "}
              {campaign.pillars_json.context}
            </li>
          )}
          {campaign.max_duration_sec && (
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Max duration:</span>{" "}
              {campaign.max_duration_sec}s
            </li>
          )}
          {campaign.opening_sentence && (
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Opening sentence (verbatim):</span>{" "}
              {campaign.opening_sentence}
            </li>
          )}
          </ul>
        </CardBody>
      </Card>

      <VoiceTest campaignId={campaignId} allowSkip={campaign.status === "draft"} />
    </div>
  );
}
