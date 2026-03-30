import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { CloneCampaignButton } from "@/components/clone-campaign-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { Table, TableShell, Td, Th } from "@/components/ui/table";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const campaignList = campaigns ?? [];
  const activeCount = campaignList.filter((c: any) => c.status === "active").length;
  const draftCount = campaignList.filter((c: any) => (c.status ?? "draft") === "draft").length;
  const pausedCount = campaignList.filter((c: any) => c.status === "paused").length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Campaigns"
        description="Manage interview studies, monitor progress, and launch calls."
        actions={(
          <Link href="/dashboard/new">
            <Button>New Campaign</Button>
          </Link>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">Total campaigns</p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{campaignList.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">Active now</p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{activeCount}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{pausedCount} paused</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">Drafts to launch</p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{draftCount}</p>
          </CardBody>
        </Card>
      </div>

      <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-1">
        <button className="rounded-[calc(var(--radius-md)-2px)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-card)]">
          Overview
        </button>
        <button className="rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
          All campaigns
        </button>
      </div>

      {!campaignList.length ? (
        <Card>
          <CardBody className="py-16 text-center">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">No campaigns yet</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Start your first campaign to test and launch interviews.
            </p>
            <div className="mt-5">
              <Link
                href="/dashboard/new"
                className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-4 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              >
                Create your first campaign
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex items-center justify-between pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Recent campaigns
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {campaignList.length} total
            </span>
          </CardHeader>
          <TableShell className="rounded-none border-0 border-t border-[var(--color-border-subtle)]">
            <Table className="min-w-[760px]">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/70">
                  <Th className="px-5">Campaign</Th>
                  <Th className="px-5">Status</Th>
                  <Th className="px-5">Pillars</Th>
                  <Th className="px-5">Created</Th>
                  <Th className="px-5 text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {campaignList.map((c: any) => (
                  <tr key={c.id} className="group hover:bg-[var(--color-surface-subtle)]/50">
                    <Td className="px-5">
                      <Link
                        href={`/dashboard/${c.id}`}
                        className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-label)]"
                      >
                        {c.title ?? c.pillars_json?.title ?? "Untitled Campaign"}
                      </Link>
                    </Td>
                    <Td className="px-5">
                      <StatusBadge status={c.status ?? "draft"} />
                    </Td>
                    <Td className="px-5 text-[var(--color-text-secondary)]">
                      {c.pillars_json?.pillars?.length ?? 0}
                    </Td>
                    <Td className="px-5 text-[var(--color-text-secondary)]">
                      {new Date(c.created_at).toLocaleDateString()}
                    </Td>
                    <Td className="px-5">
                      <div className="flex justify-end">
                        <CloneCampaignButton campaignId={c.id} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableShell>
        </Card>
      )}
    </div>
  );
}
