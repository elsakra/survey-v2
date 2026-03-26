"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface PillarField {
  id: string;
  question: string;
  context: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

type AiDraftPayload = {
  title?: string;
  context?: string;
  instructions?: string;
  max_duration_sec: number;
  opening_sentence?: string;
  interviewer_name?: string;
  org_name?: string;
  tone_style?: string;
  pillars: Array<{ id: string; question: string; context: string }>;
};

export default function NewCampaignPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [instructions, setInstructions] = useState("");
  const [maxDurationSec, setMaxDurationSec] = useState(420);
  const [openingSentence, setOpeningSentence] = useState("");
  const [interviewerName, setInterviewerName] = useState("Sarah");
  const [orgName, setOrgName] = useState("");
  const [toneStyle, setToneStyle] = useState("warm, neutral, professional, concise");

  const [pillars, setPillars] = useState<PillarField[]>([
    { id: "p1", question: "", context: "" },
  ]);

  const [timezone, setTimezone] = useState("America/New_York");
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);

  function addPillar() {
    if (pillars.length >= 5) return;
    setPillars([
      ...pillars,
      { id: `p${pillars.length + 1}`, question: "", context: "" },
    ]);
  }

  function removePillar(idx: number) {
    if (pillars.length <= 1) return;
    setPillars(pillars.filter((_, i) => i !== idx));
  }

  function updatePillar(idx: number, field: keyof PillarField, value: string) {
    setPillars(pillars.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  function toggleDay(day: number) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function mergeAiDraft(d: AiDraftPayload) {
    setTitle(d.title ?? "");
    setContext(d.context ?? "");
    setInstructions(d.instructions ?? "");
    setMaxDurationSec(d.max_duration_sec);
    setOpeningSentence(d.opening_sentence ?? "");
    setInterviewerName(d.interviewer_name?.trim() ? d.interviewer_name : "Sarah");
    setOrgName(d.org_name ?? "");
    setToneStyle(
      d.tone_style?.trim()
        ? d.tone_style
        : "warm, neutral, professional, concise",
    );
    if (d.pillars.length > 0) {
      setPillars(
        d.pillars.map((p, i) => ({
          id: p.id || `p${i + 1}`,
          question: p.question,
          context: p.context ?? "",
        })),
      );
    }
  }

  async function handleGenerateFromNl() {
    setNlError(null);
    const prompt = nlPrompt.trim();
    if (prompt.length < 4) {
      setNlError("Add a few words about what you want to learn.");
      return;
    }
    setNlBusy(true);
    try {
      const res = await fetch("/api/campaigns/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNlError(typeof data.error === "string" ? data.error : "Could not generate draft.");
        return;
      }
      if (data.draft) {
        mergeAiDraft(data.draft as AiDraftPayload);
      }
    } catch {
      setNlError("Network error. Try again.");
    } finally {
      setNlBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const validPillars = pillars.filter((p) => p.question.trim());
    if (validPillars.length === 0) {
      setError("Add at least one pillar question.");
      setSaving(false);
      return;
    }
    if (maxDurationSec < 120 || maxDurationSec > 1800) {
      setError("Max interview duration must be between 120 and 1800 seconds.");
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated.");
      setSaving(false);
      return;
    }

    const pillarsJson = {
      title: title || undefined,
      context: context || undefined,
      interviewer_name: interviewerName || undefined,
      org_name: orgName || undefined,
      pillars: validPillars.map((p) => ({
        id: p.id,
        question: p.question,
        ...(p.context ? { context: p.context } : {}),
      })),
      tone: { style: toneStyle },
      constraints: { prefer_quantification: true },
    };

    const { data, error: insertErr } = await supabase
      .from("campaigns")
      .insert({
        title: title || null,
        pillars_json: pillarsJson,
        user_id: user.id,
        instructions: instructions || null,
        max_duration_sec: maxDurationSec,
        opening_sentence: openingSentence || null,
        calling_hours: { timezone, start: startHour, end: endHour, days },
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    router.push(`/dashboard/${data.id}`);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Create Campaign</h1>

      <section className="bg-gradient-to-b from-blue-50/80 to-white rounded-xl border border-blue-100 p-6 space-y-4 mb-8">
        <h2 className="text-lg font-medium text-[var(--color-text-primary,#111)]">
          Describe your interview
        </h2>
        <p className="text-sm text-gray-600">
          Use natural language: goals, audience, topics, and length. We will draft pillar questions and settings you can edit before saving.
        </p>
        <textarea
          value={nlPrompt}
          onChange={(e) => setNlPrompt(e.target.value)}
          rows={5}
          disabled={nlBusy || saving}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          placeholder="Example: 5-minute calls with SMB owners who tried our billing product in Q1. We want to understand switching costs, what almost made them churn, and how they compare us to QuickBooks."
        />
        {nlError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{nlError}</p>
        )}
        <button
          type="button"
          onClick={handleGenerateFromNl}
          disabled={nlBusy || saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {nlBusy ? "Generating…" : "Generate draft"}
        </button>
      </section>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium">Basic Info</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campaign Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. PE Due Diligence — Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Research Context
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the purpose of this research. E.g. 'Private equity due diligence interview with current employees to understand operating health and leadership quality.'"
            />
          </div>
        </section>

        {/* Pillars */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium">Pillar Questions</h2>
            <span className="text-sm text-gray-500">{pillars.length}/5</span>
          </div>
          <p className="text-sm text-gray-500">
            These are the core topics you want to cover in each interview.
          </p>

          {pillars.map((p, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  Pillar {idx + 1}
                </span>
                {pillars.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePillar(idx)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                value={p.question}
                onChange={(e) => updatePillar(idx, "question", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. What does a typical week look like for you and your team?"
              />
              <textarea
                value={p.context}
                onChange={(e) => updatePillar(idx, "context", e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional: what are you trying to learn from this question?"
              />
            </div>
          ))}

          {pillars.length < 5 && (
            <button
              type="button"
              onClick={addPillar}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add pillar
            </button>
          )}
        </section>

        {/* Interview Settings */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium">Interview Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interviewer Name
              </label>
              <input
                type="text"
                value={interviewerName}
                onChange={(e) => setInterviewerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. a management consulting firm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tone
            </label>
            <input
              type="text"
              value={toneStyle}
              onChange={(e) => setToneStyle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              General Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional: any special instructions for the AI interviewer across all pillars"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Interview Duration (seconds)
              </label>
              <input
                type="number"
                min={120}
                max={1800}
                value={maxDurationSec}
                onChange={(e) => setMaxDurationSec(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opening Sentence (Verbatim, Optional)
              </label>
              <input
                type="text"
                value={openingSentence}
                onChange={(e) => setOpeningSentence(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="If set, AI always uses this exact opener"
              />
            </div>
          </div>
        </section>

        {/* Calling Hours */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium">Calling Hours</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start
              </label>
              <input
                type="time"
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End
              </label>
              <input
                type="time"
                value={endHour}
                onChange={(e) => setEndHour(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Days
            </label>
            <div className="flex gap-2">
              {DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    days.includes(d.value)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Creating..." : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}
