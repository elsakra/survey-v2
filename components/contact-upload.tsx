"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Papa from "papaparse";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface ContactUploadProps {
  campaignId: string;
  userId: string;
  onComplete: () => void;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

export function ContactUpload({ campaignId, userId, onComplete }: ContactUploadProps) {
  const [mode, setMode] = useState<"csv" | "manual">("csv");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvResults, setCsvResults] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Array<Record<string, string>>;
        let added = 0;
        let skipped = 0;
        let dupes = 0;

        const supabase = createClient();
        const { data: existing } = await supabase
          .from("contacts")
          .select("phone")
          .eq("campaign_id", campaignId);
        const existingPhones = new Set((existing ?? []).map((c) => c.phone));

        const seen = new Set<string>();
        const contacts = rows
          .map((row) => {
            const rawPhone =
              row.phone || row.Phone || row.phone_number || row.PhoneNumber || "";
            const phone = normalizePhone(rawPhone);
            if (!phone) {
              skipped++;
              return null;
            }
            if (existingPhones.has(phone) || seen.has(phone)) {
              dupes++;
              return null;
            }
            seen.add(phone);
            return {
              campaign_id: campaignId,
              user_id: userId,
              phone,
              name: row.name || row.Name || row.first_name || null,
              email: row.email || row.Email || null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;

        if (contacts.length > 0) {
          const { error: insertError } = await supabase.from("contacts").insert(contacts);
          if (insertError) {
            setError(insertError.message);
          } else {
            added = contacts.length;
          }
        }

        const parts = [`Added ${added} contacts`];
        if (skipped > 0) parts.push(`skipped ${skipped} (invalid phone)`);
        if (dupes > 0) parts.push(`skipped ${dupes} duplicate${dupes === 1 ? "" : "s"}`);
        setCsvResults(parts.join(", "));
        setUploading(false);
        if (added > 0) onComplete();
        if (fileRef.current) fileRef.current.value = "";
      },
      error: (err) => {
        setError(err.message);
        setUploading(false);
      },
    });
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const phone = normalizePhone(manualPhone);
    if (!phone) {
      setError("Invalid phone number. Use E.164 format (e.g. +15551234567).");
      return;
    }

    setUploading(true);
    const supabase = createClient();

    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("phone", phone)
      .limit(1);
    if (existing && existing.length > 0) {
      setError("This phone number is already in this campaign.");
      setUploading(false);
      return;
    }

    const { error: insertError } = await supabase.from("contacts").insert({
      campaign_id: campaignId,
      user_id: userId,
      phone,
      name: manualName || null,
      email: manualEmail || null,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setManualName("");
      setManualPhone("");
      setManualEmail("");
      onComplete();
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onChange={(value) => setMode(value as "csv" | "manual")}
        items={[
          { value: "csv", label: "CSV Upload" },
          { value: "manual", label: "Manual Entry" },
        ]}
      />

      {mode === "csv" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Upload a CSV with columns: <code className="rounded bg-[var(--color-surface-subtle)] px-1 py-0.5 text-xs">phone</code>,{" "}
            <code className="rounded bg-[var(--color-surface-subtle)] px-1 py-0.5 text-xs">name</code> (optional),{" "}
            <code className="rounded bg-[var(--color-surface-subtle)] px-1 py-0.5 text-xs">email</code> (optional)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            disabled={uploading}
            className="block text-sm text-[var(--color-text-secondary)] file:mr-4 file:rounded-[var(--radius-md)] file:border file:border-[var(--color-border)] file:bg-[var(--color-surface-elevated)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--color-text-primary)] hover:file:bg-[var(--color-surface-subtle)]"
          />
          {csvResults && (
            <p className="text-sm text-[var(--color-success-strong)]">{csvResults}</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleManualAdd} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input
              type="text"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              placeholder="Phone (+15551234567)"
              required
            />
            <Input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Name (optional)"
            />
            <Input
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="Email (optional)"
            />
          </div>
          <Button type="submit" disabled={uploading}>
            Add Contact
          </Button>
        </form>
      )}

      {error && (
        <Alert variant="danger">{error}</Alert>
      )}
    </div>
  );
}
