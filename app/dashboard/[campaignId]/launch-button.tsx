"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
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
        const ids = Array.isArray(body?.eventIds)
          ? body.eventIds.filter((id: unknown): id is string => typeof id === "string")
          : [];
        if (ids.length === 0) {
          setErrorMessage("Launch was accepted but no Inngest event IDs were returned. Please retry.");
          return;
        }
        setEventIds(ids);
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
        {eventIds.length > 0 && (
          <p className="text-xs text-gray-500">
            Inngest event IDs: {eventIds.join(", ")}
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
