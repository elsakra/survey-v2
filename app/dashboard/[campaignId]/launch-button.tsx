"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(0);
  const router = useRouter();

  async function handleLaunch() {
    if (!window.confirm("Launch this campaign? Calls will be placed to all pending contacts.")) return;
    setLaunching(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/launch`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || body?.success !== true) {
        setErrorMessage(body?.error ?? "Failed to launch campaign");
      } else {
        setScheduled(body.scheduled ?? body.pendingContacts ?? 0);
        setLaunched(true);
        router.refresh();
      }
    } catch {
      setErrorMessage("Failed to launch campaign");
    } finally {
      setLaunching(false);
    }
  }

  if (launched) {
    return (
      <div className="space-y-2">
        <span className="inline-block px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-lg">
          Campaign Launched
        </span>
        {scheduled > 0 && (
          <p className="text-xs text-gray-500">
            {scheduled} contact{scheduled === 1 ? "" : "s"} scheduled for calling.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleLaunch}
        disabled={launching}
        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {launching ? "Launching..." : "Launch Campaign"}
      </button>
      {errorMessage && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
