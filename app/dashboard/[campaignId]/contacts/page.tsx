"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ContactUpload } from "@/components/contact-upload";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs } from "@/components/ui/tabs";

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  last_attempted_at: string | null;
  session_id: string | null;
  created_at: string;
}

export default function ContactsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("contacts")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, [campaignId, filter]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
    loadContacts();
  }, [loadContacts]);

  const statuses = ["all", "pending", "queued", "attempted", "completed", "failed", "exhausted"];

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/${campaignId}`}
        className="inline-block text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        &larr; Back to campaign
      </Link>
      <SectionHeader title="Contacts" description="Upload and manage who gets called in this campaign." />

      <Card>
        <CardBody>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Add Contacts
          </h3>
          {userId && (
            <ContactUpload
              campaignId={campaignId}
              userId={userId}
              onComplete={loadContacts}
            />
          )}
          {contacts.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"} ready.
              </p>
              <Link href={`/dashboard/${campaignId}`}>
                <Button>Continue to Review & Launch</Button>
              </Link>
            </div>
          )}
        </CardBody>
      </Card>

      <Tabs
        value={filter}
        onChange={setFilter}
        items={statuses.map((s) => ({
          value: s,
          label: s === "all" ? "All" : s.replace(/_/g, " "),
        }))}
      />

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : contacts.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-[var(--color-text-muted)]">
            No contacts{filter !== "all" ? ` with status "${filter}"` : ""}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/60">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Phone</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Attempts</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Last Attempted</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Transcript</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--color-surface-subtle)]/45">
                  <td className="px-4 py-2 text-sm">{c.name ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">{c.phone}</td>
                  <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                    {c.attempts}/{c.max_attempts}
                  </td>
                  <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                    {c.last_attempted_at
                      ? new Date(c.last_attempted_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
