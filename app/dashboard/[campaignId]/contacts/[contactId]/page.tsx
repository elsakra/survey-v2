import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { TranscriptViewer } from "@/components/transcript-viewer";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string; contactId: string }>;
}) {
  const { campaignId, contactId } = await params;
  const supabase = await createServerClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .eq("campaign_id", campaignId)
    .single();

  if (!contact) notFound();

  const { data: attempts } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("contact_id", contactId)
    .order("attempt_num", { ascending: true });

  let transcripts: any[] = [];
  let session: any = null;
  let dbTurns: any[] = [];
  if (contact.session_id) {
    const { data: sess } = await supabase.from("sessions").select("*").eq("id", contact.session_id).single();
    session = sess;

    const { data: trans } = await supabase
      .from("transcripts")
      .select("*")
      .eq("session_id", contact.session_id)
      .order("created_at", { ascending: true });
    transcripts = trans ?? [];

    const { data: turnRows } = await supabase
      .from("turns")
      .select("turn_index,speaker,prompt_text,response_text,start_ms,end_ms")
      .eq("session_id", contact.session_id)
      .order("turn_index", { ascending: true });
    dbTurns = turnRows ?? [];
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/dashboard/${campaignId}/contacts`}
        className="mb-4 inline-block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        &larr; Back to contacts
      </Link>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-xl font-medium text-[var(--color-text-primary)]">
              {contact.name ?? "Unknown Contact"}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{contact.phone}</p>
            {contact.email && <p className="text-sm text-[var(--color-text-muted)]">{contact.email}</p>}
          </div>
          <StatusBadge status={contact.status} />
        </div>
      </div>

      {attempts && attempts.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
          <div className="border-b border-[var(--color-border-subtle)] px-5 py-3">
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--color-label)]">
              Call Attempts
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  #
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Started
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Ended
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Error
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {attempts.map((a: any) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 text-sm text-[var(--color-text-primary)]">{a.attempt_num}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                    {new Date(a.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                    {a.ended_at ? new Date(a.ended_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-[var(--color-danger)]">{a.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {session && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-[var(--color-label)]">Session</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-[var(--color-text-muted)]">Status</span>
              <div className="mt-1">
                <StatusBadge status={session.status} />
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Started</span>
              <p className="mt-1 text-[var(--color-text-primary)]">
                {session.created_at ? new Date(session.created_at).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Ended</span>
              <p className="mt-1 text-[var(--color-text-primary)]">
                {session.ended_at ? new Date(session.ended_at).toLocaleString() : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {transcripts.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[var(--color-label)]">Transcript</h3>
          <TranscriptViewer transcripts={transcripts} sessionId={contact.session_id!} dbTurns={dbTurns} />
        </div>
      ) : contact.session_id ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Transcript not yet available</p>
        </div>
      ) : null}
    </div>
  );
}
