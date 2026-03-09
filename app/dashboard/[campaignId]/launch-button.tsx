"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
        <span className="inline-block rounded-[var(--radius-md)] bg-[var(--color-success-soft)] px-4 py-2 text-sm font-medium text-[var(--color-success-strong)]">
          Campaign Launched
        </span>
        {scheduled > 0 && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {scheduled} contact{scheduled === 1 ? "" : "s"} scheduled for calling.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleLaunch} disabled={launching} variant="success">
        {launching ? "Launching..." : "Launch Campaign"}
      </Button>
      {errorMessage && (
        <Alert variant="danger" className="text-xs">{errorMessage}</Alert>
      )}
    </div>
  );
}
