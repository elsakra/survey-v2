import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { DashboardCampaignsPanel } from "@/components/dashboard-campaigns-panel";

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
        <DashboardCampaignsPanel campaigns={campaignList} />
      )}
    </div>
  );
}
