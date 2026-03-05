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
  const { data: { user } } = await supabase.auth.getUser();

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
    const { data: sess } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", contact.session_id)
      .single();
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
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
      >
        &larr; Back to contacts
      </Link>

      {/* Contact Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-semibold">{contact.name ?? "Unknown Contact"}</h1>
            <p className="text-sm text-gray-500 mt-1">{contact.phone}</p>
            {contact.email && <p className="text-sm text-gray-500">{contact.email}</p>}
          </div>
          <StatusBadge status={contact.status} />
        </div>
      </div>

      {/* Call Attempts */}
      {attempts && attempts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Call Attempts
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">#</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Started</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Ended</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attempts.map((a: any) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 text-sm">{a.attempt_num}</td>
                  <td className="px-4 py-2"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {new Date(a.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {a.ended_at ? new Date(a.ended_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-red-500">{a.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Session Info */}
      {session && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
            Session
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Status</span>
              <div className="mt-1"><StatusBadge status={session.status} /></div>
            </div>
            <div>
              <span className="text-gray-500">Started</span>
              <p className="mt-1 text-gray-700">
                {session.created_at ? new Date(session.created_at).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Ended</span>
              <p className="mt-1 text-gray-700">
                {session.ended_at ? new Date(session.ended_at).toLocaleString() : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcripts.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Transcript
          </h3>
          <TranscriptViewer transcripts={transcripts} sessionId={contact.session_id!} dbTurns={dbTurns} />
        </div>
      ) : contact.session_id ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-400">Transcript not yet available</p>
        </div>
      ) : null}
    </div>
  );
}
