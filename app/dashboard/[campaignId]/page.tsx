import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { LaunchButton } from "./launch-button";
import { PauseResumeButton } from "./pause-resume-button";
import { CloneButton } from "./clone-button";
import { CampaignAnalysis } from "./campaign-analysis";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Alert } from "@/components/ui/alert";
import { Table, TableShell, Td, Th } from "@/components/ui/table";

export default async function CampaignDetailPage({
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

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  const { count: completedCount } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "completed");

  const pillars = campaign.pillars_json?.pillars ?? [];
  const contactList = contacts ?? [];
  const isDraft = (campaign.status ?? "draft") === "draft";
  const hasContacts = contactList.length > 0;
  const hasTested = Boolean(campaign.test_completed_at || campaign.test_skipped_at);
  const nextHref = !hasTested
    ? `/dashboard/${campaignId}/test`
    : !hasContacts
      ? `/dashboard/${campaignId}/contacts`
      : `/dashboard/${campaignId}`;
  const nextLabel = !hasTested
    ? "Step 1: Test Interview"
    : !hasContacts
      ? "Step 2: Add Contacts"
      : "Step 3: Launch Campaign";
  const nextHint = !hasTested
    ? "Run a quick browser test call (or skip), then continue setup."
    : !hasContacts
      ? "Test complete. Add contacts so you can launch live calls."
      : "Ready to launch: review contacts and start calls.";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="mb-2 inline-block text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            &larr; Back to campaigns
          </Link>
          <SectionHeader
            title={campaign.title ?? campaign.pillars_json?.title ?? "Untitled Campaign"}
            actions={(
              <>
                {campaign.status === "draft" && (
                  <Link href={`/dashboard/${campaignId}/edit`}>
                    <Button variant="secondary">Edit Campaign</Button>
                  </Link>
                )}
                <CloneButton campaignId={campaignId} />
                <Link href={`/dashboard/${campaignId}/test`}>
                  <Button variant="secondary">Test Interview</Button>
                </Link>
                <Link href={`/dashboard/${campaignId}/contacts`}>
                  <Button variant="secondary">Manage Contacts</Button>
                </Link>
                {(campaign.status === "active" || campaign.status === "paused") && (
                  <PauseResumeButton campaignId={campaignId} status={campaign.status} />
                )}
                {campaign.status === "draft" && contactList.length > 0 && (
                  <LaunchButton campaignId={campaignId} />
                )}
              </>
            )}
          />
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={campaign.status ?? "draft"} />
            <span className="text-sm text-[var(--color-text-secondary)]">
              {pillars.length} pillar{pillars.length !== 1 ? "s" : ""} &middot;{" "}
              {contactList.length} contact{contactList.length !== 1 ? "s" : ""} &middot;{" "}
              {completedCount ?? 0} completed
            </span>
          </div>
        </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Pillars</p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{pillars.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Contacts</p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{contactList.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Completed</p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{completedCount ?? 0}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Readiness</p>
            <p className="text-base font-semibold text-[var(--color-text-primary)]">
              {!hasTested ? "Needs test call" : !hasContacts ? "Needs contacts" : "Ready to launch"}
            </p>
          </CardBody>
        </Card>
      </div>

      {isDraft && (
        <Alert variant="info" className="p-5">
          <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wider mb-2">
            What To Do Next
          </h2>
          <p className="text-sm text-blue-800 mb-4">{nextHint}</p>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700">Step 1</p>
              <p className="text-sm text-gray-700 mt-1">
                Test interview in browser (or skip)
              </p>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700">Step 2</p>
              <p className="text-sm text-gray-700 mt-1">
                Add or review contacts
              </p>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700">Step 3</p>
              <p className="text-sm text-gray-700 mt-1">Launch campaign calls</p>
            </div>
          </div>
          <div className="flex gap-2">
            {nextLabel === "Step 3: Launch Campaign" ? (
              <span className="rounded-[var(--radius-md)] bg-[var(--color-success-soft)] px-4 py-2 text-sm font-medium text-[var(--color-success-strong)]">
                Ready to launch
              </span>
            ) : (
              <Link href={nextHref}><Button>{nextLabel}</Button></Link>
            )}
            {hasContacts && (
              <Link href={`/dashboard/${campaignId}/contacts`}><Button variant="secondary">Review Contacts</Button></Link>
            )}
          </div>
        </Alert>
      )}

      {campaign.pillars_json?.context && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
              Research Context
            </h3>
            <p className="text-sm text-[var(--color-text-primary)]">{campaign.pillars_json.context}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h3 className="text-sm font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
            Pillar Questions
          </h3>
          <div className="space-y-2">
            {pillars.map((p: any, i: number) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/40 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Pillar {i + 1}</p>
                <p className="mt-1 text-sm text-[var(--color-text-primary)]">{p.question}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {contactList.length > 0 && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Contacts
            </h3>
            <Link
              href={`/dashboard/${campaignId}/contacts`}
              className="text-sm font-medium text-[var(--color-accent)] hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <TableShell className="rounded-none border-0 border-t border-[var(--color-border-subtle)]">
            <Table className="min-w-[760px]">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border-subtle)]">
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                  <Th>Attempts</Th>
                  <Th>Transcript</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {contactList.slice(0, 10).map((c: any) => (
                  <tr key={c.id} className="hover:bg-[var(--color-surface-subtle)]/45">
                    <Td>{c.name ?? "—"}</Td>
                    <Td className="text-[var(--color-text-secondary)]">{c.phone}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="text-[var(--color-text-secondary)]">{c.attempts}/{c.max_attempts}</Td>
                    <Td>
                      {c.session_id ? (
                        <Link
                          href={`/dashboard/${campaignId}/contacts/${c.id}`}
                          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-sm text-[var(--color-text-muted)]">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableShell>
        </Card>
      )}

      {/* Campaign Analysis */}
      <CampaignAnalysis campaignId={campaignId} />
    </div>
  );
}
