"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-states";

export function CloneButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/clone`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to clone campaign");
        return;
      }
      router.push(`/dashboard/${body.id}/edit`);
    } catch {
      setError("Failed to clone campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClone} disabled={loading} variant="secondary">
        {loading ? "Cloning..." : "Clone Campaign"}
      </Button>
      {error ? <InlineError message={error} /> : null}
    </div>
  );
}
