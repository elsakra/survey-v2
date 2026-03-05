"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ContactUpload } from "@/components/contact-upload";
import { StatusBadge } from "@/components/status-badge";

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
    <div>
      <Link
        href={`/dashboard/${campaignId}`}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
      >
        &larr; Back to campaign
      </Link>
      <h1 className="text-2xl font-semibold mb-6">Contacts</h1>

      {/* Upload Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Add Contacts
        </h3>
        {userId && (
          <ContactUpload
            campaignId={campaignId}
            userId={userId}
            onComplete={loadContacts}
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === s
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {s === "all" ? "All" : s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading...</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center bg-white rounded-xl border border-gray-200">
          No contacts{filter !== "all" ? ` with status "${filter}"` : ""}
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Phone</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Attempts</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Last Attempted</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Transcript</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{c.name ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{c.phone}</td>
                  <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {c.attempts}/{c.max_attempts}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {c.last_attempted_at
                      ? new Date(c.last_attempted_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {c.session_id ? (
                      <Link
                        href={`/dashboard/${campaignId}/contacts/${c.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
