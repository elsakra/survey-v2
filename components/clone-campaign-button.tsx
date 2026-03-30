"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloneCampaignButton({ campaignId }: { campaignId: string }) {
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
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
    >
      {loading ? "Cloning..." : "Clone"}
    </button>
  );
}
