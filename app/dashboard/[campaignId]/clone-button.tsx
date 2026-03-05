"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloneButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClone() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/clone`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error ?? "Failed to clone campaign");
        return;
      }
      router.push(`/dashboard/${body.id}/edit`);
    } catch {
      alert("Failed to clone campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClone}
      disabled={loading}
      className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      {loading ? "Cloning..." : "Clone Campaign"}
    </button>
  );
}
