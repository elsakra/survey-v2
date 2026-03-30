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
    <div className="space-y-6">
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

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Alert variant="info">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">
            Before You Start
          </h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-[var(--color-text-primary)]">
            <li>Use Chrome or Edge on desktop.</li>
            <li>Allow microphone access when prompted.</li>
            <li>Make sure your mic is not muted and volume is up.</li>
          </ol>
          <div className="mt-4 space-y-1 text-sm text-[var(--color-text-secondary)]">
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
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">
              Current Configuration
            </h3>
            <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]">
              <li>
                <span className="font-medium text-[var(--color-text-primary)]">Title:</span>{" "}
                {campaign.title ?? campaign.pillars_json?.title ?? "Untitled"}
              </li>
              <li>
                <span className="font-medium text-[var(--color-text-primary)]">Pillars:</span>{" "}
                {pillars.length}
              </li>
              {campaign.max_duration_sec && (
                <li>
                  <span className="font-medium text-[var(--color-text-primary)]">Max duration:</span>{" "}
                  {campaign.max_duration_sec}s
                </li>
              )}
              {campaign.opening_sentence && (
                <li>
                  <span className="font-medium text-[var(--color-text-primary)]">Opening sentence:</span>{" "}
                  custom
                </li>
              )}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Pillars In This Test
          </h3>
          <div className="space-y-2">
            {pillars.map((p: any, index: number) => (
              <div key={p.id ?? index} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/40 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Pillar {index + 1}</p>
                <p className="mt-1 text-sm text-[var(--color-text-primary)]">{p.question}</p>
              </div>
            ))}
          </div>
          {campaign.pillars_json?.context && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">Context:</span>{" "}
              {campaign.pillars_json.context}
            </p>
          )}
        </CardBody>
      </Card>

      <VoiceTest campaignId={campaignId} allowSkip={campaign.status === "draft"} />
    </div>
  );
}
