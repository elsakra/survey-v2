"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Papa from "papaparse";

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

        const contacts = rows
          .map((row) => {
            const rawPhone =
              row.phone || row.Phone || row.phone_number || row.PhoneNumber || "";
            const phone = normalizePhone(rawPhone);
            if (!phone) {
              skipped++;
              return null;
            }
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
          const supabase = createClient();
          const { error: insertError } = await supabase.from("contacts").insert(contacts);
          if (insertError) {
            setError(insertError.message);
          } else {
            added = contacts.length;
          }
        }

        setCsvResults(`Added ${added} contacts${skipped > 0 ? `, skipped ${skipped} (invalid phone)` : ""}`);
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
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setMode("csv")}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
            mode === "csv" ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          CSV Upload
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
            mode === "manual" ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Manual Entry
        </button>
      </div>

      {mode === "csv" ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Upload a CSV with columns: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">phone</code>,{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">name</code> (optional),{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">email</code> (optional)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            disabled={uploading}
            className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
          />
          {csvResults && (
            <p className="text-sm text-green-600">{csvResults}</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleManualAdd} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              placeholder="Phone (+15551234567)"
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Name (optional)"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="Email (optional)"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Add Contact
          </button>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}
    </div>
  );
}
