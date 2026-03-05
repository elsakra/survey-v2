"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const router = useRouter();

  async function handleLaunch() {
    if (!window.confirm("Launch this campaign? Calls will be placed to all pending contacts.")) return;
    setLaunching(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/launch`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error ?? "Failed to launch");
      } else {
        setLaunched(true);
        router.refresh();
      }
    } catch {
      alert("Failed to launch campaign");
    } finally {
      setLaunching(false);
    }
  }

  if (launched) {
    return (
      <span className="px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-lg">
        Campaign Launched
      </span>
    );
  }

  return (
    <button
      onClick={handleLaunch}
      disabled={launching}
      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
    >
      {launching ? "Launching..." : "Launch Campaign"}
    </button>
  );
}
