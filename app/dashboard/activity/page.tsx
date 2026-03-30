import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TableShell, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";

type AttemptRow = {
  id: string;
  status: string;
  attempt_num: number;
  started_at: string;
  ended_at: string | null;
  campaign_id: string;
  contacts: { name: string | null; phone: string } | null;
  campaigns: { title: string | null } | null;
};

function one<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function ActivityPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: owned } = await supabase
    .from("campaigns")
    .select("id")
    .eq("user_id", user!.id);

  const campaignIds = (owned ?? []).map((r) => r.id);

  let attempts: AttemptRow[] = [];

  if (campaignIds.length > 0) {
    const { data } = await supabase
      .from("call_attempts")
      .select(
        `
        id,
        status,
        attempt_num,
        started_at,
        ended_at,
        campaign_id,
        contacts ( name, phone ),
        campaigns ( title )
      `,
      )
      .in("campaign_id", campaignIds)
      .order("started_at", { ascending: false })
      .limit(50);

    attempts = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      status: row.status as string,
      attempt_num: row.attempt_num as number,
      started_at: row.started_at as string,
      ended_at: (row.ended_at as string | null) ?? null,
      campaign_id: row.campaign_id as string,
      contacts: one(row.contacts as AttemptRow["contacts"] | AttemptRow["contacts"][] | null),
      campaigns: one(row.campaigns as AttemptRow["campaigns"] | AttemptRow["campaigns"][] | null),
    }));
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Activity"
        description="Recent outbound call attempts across your campaigns."
      />

      {!attempts.length ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              No call activity yet. Launch a campaign with contacts to see attempts here.
            </p>
            <div className="mt-4">
              <Link
                href="/dashboard"
                className="text-sm font-medium text-[var(--color-label)] hover:underline"
              >
                Back to campaigns
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex items-center justify-between pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Recent attempts
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">{attempts.length} shown</span>
          </CardHeader>
          <TableShell className="rounded-none border-0 border-t border-[var(--color-border-subtle)]">
            <Table className="min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/70">
                  <Th className="px-5">Started</Th>
                  <Th className="px-5">Campaign</Th>
                  <Th className="px-5">Contact</Th>
                  <Th className="px-5">Attempt</Th>
                  <Th className="px-5">Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {attempts.map((row) => {
                  const contactLabel =
                    [row.contacts?.name, row.contacts?.phone].filter(Boolean).join(" · ") ||
                    row.contacts?.phone ||
                    "—";
                  return (
                    <tr key={row.id} className="group hover:bg-[var(--color-surface-subtle)]/50">
                      <Td className="px-5 whitespace-nowrap text-[var(--color-text-secondary)]">
                        {new Date(row.started_at).toLocaleString()}
                      </Td>
                      <Td className="px-5">
                        <Link
                          href={`/dashboard/${row.campaign_id}`}
                          className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-label)]"
                        >
                          {row.campaigns?.title ?? "Campaign"}
                        </Link>
                      </Td>
                      <Td className="px-5 text-sm text-[var(--color-text-secondary)]">
                        {contactLabel}
                      </Td>
                      <Td className="px-5 text-[var(--color-text-secondary)]">{row.attempt_num}</Td>
                      <Td className="px-5">
                        <StatusBadge status={row.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableShell>
        </Card>
      )}
    </div>
  );
}
