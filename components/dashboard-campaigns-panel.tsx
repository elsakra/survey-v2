"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { CloneCampaignButton } from "@/components/clone-campaign-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TableShell, Td, Th } from "@/components/ui/table";

type CampaignRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string;
  pillars_json?: { title?: string; pillars?: unknown[] } | null;
};

const OVERVIEW_LIMIT = 5;

export function DashboardCampaignsPanel({ campaigns }: { campaigns: CampaignRow[] }) {
  const [view, setView] = useState<"overview" | "all">("overview");

  const display =
    view === "overview" ? campaigns.slice(0, OVERVIEW_LIMIT) : campaigns;
  const overviewTruncated = view === "overview" && campaigns.length > OVERVIEW_LIMIT;

  return (
    <div className="space-y-4">
      <div
        className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-1"
        role="tablist"
        aria-label="Campaign list view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "overview"}
          className={
            view === "overview"
              ? "rounded-[calc(var(--radius-md)-2px)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-card)]"
              : "rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }
          onClick={() => setView("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "all"}
          className={
            view === "all"
              ? "rounded-[calc(var(--radius-md)-2px)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-card)]"
              : "rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }
          onClick={() => setView("all")}
        >
          All campaigns
        </button>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between pb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {view === "overview" ? "Recent campaigns" : "All campaigns"}
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {view === "overview" && overviewTruncated
              ? `${display.length} of ${campaigns.length}`
              : `${campaigns.length} total`}
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
              {display.map((c) => (
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
        {view === "overview" && overviewTruncated ? (
          <div className="border-t border-[var(--color-border-subtle)] px-5 py-3 text-center">
            <button
              type="button"
              onClick={() => setView("all")}
              className="text-sm font-medium text-[var(--color-label)] hover:underline"
            >
              View all {campaigns.length} campaigns
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
