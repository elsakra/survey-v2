"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PauseResumeButton({
  campaignId,
  status,
}: {
  campaignId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isPaused = status === "paused";
  const action = isPaused ? "resume" : "pause";
  const label = isPaused ? "Resume Campaign" : "Pause Campaign";

  async function handleClick() {
    if (loading) return;
    const confirmed = isPaused
      ? window.confirm("Resume this campaign and continue pending calls?")
      : window.confirm("Pause this campaign? New calls will stop scheduling.");
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error ?? "Failed to update campaign status");
      } else {
        router.refresh();
      }
    } catch {
      alert("Failed to update campaign status");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors ${
        isPaused ? "bg-blue-600 hover:bg-blue-700" : "bg-yellow-600 hover:bg-yellow-700"
      }`}
    >
      {loading ? (isPaused ? "Resuming..." : "Pausing...") : label}
    </button>
  );
}

