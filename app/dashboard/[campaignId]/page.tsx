import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { LaunchButton } from "./launch-button";

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
  const nextHref = hasContacts
    ? `/dashboard/${campaignId}/test`
    : `/dashboard/${campaignId}/contacts`;
  const nextLabel = hasContacts ? "Step 1: Test Interview" : "Step 1: Add Contacts";
  const nextHint = hasContacts
    ? "Run a quick browser test call, refine your prompts, then launch."
    : "Upload or add contacts first so you can launch calls.";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">
            &larr; Back to campaigns
          </Link>
          <h1 className="text-2xl font-semibold">
            {campaign.title ?? campaign.pillars_json?.title ?? "Untitled Campaign"}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={campaign.status ?? "draft"} />
            <span className="text-sm text-gray-500">
              {pillars.length} pillar{pillars.length !== 1 ? "s" : ""} &middot;{" "}
              {contactList.length} contact{contactList.length !== 1 ? "s" : ""} &middot;{" "}
              {completedCount ?? 0} completed
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/${campaignId}/test`}
            className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Test Interview
          </Link>
          <Link
            href={`/dashboard/${campaignId}/contacts`}
            className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Manage Contacts
          </Link>
          {campaign.status === "draft" && contactList.length > 0 && (
            <LaunchButton campaignId={campaignId} />
          )}
        </div>
      </div>

      {isDraft && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wider mb-2">
            What To Do Next
          </h2>
          <p className="text-sm text-blue-800 mb-4">{nextHint}</p>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700">Step 1</p>
              <p className="text-sm text-gray-700 mt-1">
                {hasContacts ? "Test interview in browser" : "Add your contact list"}
              </p>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700">Step 2</p>
              <p className="text-sm text-gray-700 mt-1">
                {hasContacts ? "Add or review contacts" : "Run a test interview"}
              </p>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700">Step 3</p>
              <p className="text-sm text-gray-700 mt-1">Launch campaign calls</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={nextHref}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {nextLabel}
            </Link>
            {hasContacts && (
              <Link
                href={`/dashboard/${campaignId}/contacts`}
                className="px-4 py-2 bg-white border border-blue-300 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
              >
                Review Contacts
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Research Context */}
      {campaign.pillars_json?.context && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
            Research Context
          </h3>
          <p className="text-sm text-gray-700">{campaign.pillars_json.context}</p>
        </div>
      )}

      {/* Pillars */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Pillar Questions
        </h3>
        <div className="space-y-3">
          {pillars.map((p: any, i: number) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs font-medium text-gray-400 mt-0.5 w-6">{i + 1}.</span>
              <p className="text-sm text-gray-700">{p.question}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contacts Summary */}
      {contactList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Contacts
            </h3>
            <Link
              href={`/dashboard/${campaignId}/contacts`}
              className="text-sm text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Phone</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Attempts</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Transcript</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contactList.slice(0, 10).map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{c.name ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{c.phone}</td>
                  <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-2 text-sm text-gray-500">{c.attempts}/{c.max_attempts}</td>
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

      {/* Analysis Placeholder */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Analysis
        </h3>
        <button
          disabled
          className="px-4 py-2 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
        >
          Generate Analysis (Coming Soon)
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Batch transcript analysis will be available here once enough interviews are completed.
        </p>
      </div>
    </div>
  );
}
