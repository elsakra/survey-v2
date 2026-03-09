import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { CloneCampaignButton } from "@/components/clone-campaign-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Campaigns"
        description="Create, test, and launch AI-led interview studies."
        actions={(
          <Link
            href="/dashboard/new"
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 text-sm font-medium text-white hover:brightness-95"
          >
            New Campaign
          </Link>
        )}
      />

      {!campaigns || campaigns.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">No campaigns yet</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Start your first campaign to test and launch interviews.
            </p>
            <div className="mt-5">
              <Link
                href="/dashboard/new"
                className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Create your first campaign
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Recent campaigns
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {campaigns.length} total
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Campaign
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Pillars
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Created
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {campaigns.map((c: any) => (
                  <tr key={c.id} className="group hover:bg-[var(--color-surface-subtle)]/50">
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/${c.id}`}
                        className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)]"
                      >
                        {c.title ?? c.pillars_json?.title ?? "Untitled Campaign"}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={c.status ?? "draft"} />
                    </td>
                    <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                      {c.pillars_json?.pillars?.length ?? 0}
                    </td>
                    <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <CloneCampaignButton campaignId={c.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
