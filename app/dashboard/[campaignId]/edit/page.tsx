"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface PillarField {
  id: string;
  question: string;
  context: string;
}

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

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [nlRefinePrompt, setNlRefinePrompt] = useState("");
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
  const [pillars, setPillars] = useState<PillarField[]>([{ id: "p1", question: "", context: "" }]);
  const [timezone, setTimezone] = useState("America/New_York");
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaign() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setError("Please sign in again.");
          setLoading(false);
        }
        return;
      }

      const { data: campaign, error: fetchErr } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("user_id", user.id)
        .single();

      if (fetchErr || !campaign) {
        if (!cancelled) {
          setError("Campaign not found.");
          setLoading(false);
        }
        return;
      }

      const status = campaign.status ?? "draft";
      const draft = status === "draft";
      const pillarsJson = campaign.pillars_json ?? {};
      const existingPillars = Array.isArray(pillarsJson.pillars) ? pillarsJson.pillars : [];
      const callingHours = campaign.calling_hours ?? {};

      if (!cancelled) {
        setIsDraft(draft);
        setTitle(campaign.title ?? "");
        setContext(pillarsJson.context ?? "");
        setInstructions(campaign.instructions ?? "");
        setMaxDurationSec(campaign.max_duration_sec ?? 420);
        setOpeningSentence(campaign.opening_sentence ?? "");
        setInterviewerName(pillarsJson.interviewer_name ?? "Sarah");
        setOrgName(pillarsJson.org_name ?? "");
        setToneStyle(pillarsJson.tone?.style ?? "warm, neutral, professional, concise");
        setPillars(
          existingPillars.length > 0
            ? existingPillars.map((p: any, i: number) => ({
                id: p.id ?? `p${i + 1}`,
                question: p.question ?? "",
                context: p.context ?? "",
              }))
            : [{ id: "p1", question: "", context: "" }],
        );
        setTimezone(callingHours.timezone ?? "America/New_York");
        setStartHour(callingHours.start ?? "09:00");
        setEndHour(callingHours.end ?? "17:00");
        setDays(Array.isArray(callingHours.days) && callingHours.days.length > 0 ? callingHours.days : [1, 2, 3, 4, 5]);
        setLoading(false);
      }
    }

    loadCampaign();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function addPillar() {
    if (pillars.length >= 5) return;
    setPillars([...pillars, { id: `p${pillars.length + 1}`, question: "", context: "" }]);
  }

  function removePillar(idx: number) {
    if (pillars.length <= 1) return;
    setPillars(pillars.filter((_, i) => i !== idx));
  }

  function updatePillar(idx: number, field: keyof PillarField, value: string) {
    setPillars(pillars.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
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

  async function handleRefineWithAi() {
    setNlError(null);
    const prompt = nlRefinePrompt.trim();
    if (prompt.length < 4) {
      setNlError("Say what you want to change (a few words or more).");
      return;
    }
    setNlBusy(true);
    try {
      const res = await fetch("/api/campaigns/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "revise",
          prompt,
          current: {
            title,
            context,
            instructions,
            max_duration_sec: maxDurationSec,
            opening_sentence: openingSentence,
            interviewer_name: interviewerName,
            org_name: orgName,
            tone_style: toneStyle,
            pillars: pillars.map((p) => ({
              question: p.question,
              context: p.context,
            })),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNlError(typeof data.error === "string" ? data.error : "Could not update draft.");
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please sign in again.");
      setSaving(false);
      return;
    }

    const pillarsJson = {
      title: title || undefined,
      context: context || undefined,
      interviewer_name: interviewerName || undefined,
      org_name: orgName || undefined,
      pillars: validPillars.map((p, idx) => ({
        id: `p${idx + 1}`,
        question: p.question,
        ...(p.context ? { context: p.context } : {}),
      })),
      tone: { style: toneStyle },
      constraints: { prefer_quantification: true },
    };

    const { data: updated, error: updateErr } = await supabase
      .from("campaigns")
      .update({
        title: title || null,
        pillars_json: pillarsJson,
        instructions: instructions || null,
        max_duration_sec: maxDurationSec,
        opening_sentence: openingSentence || null,
        calling_hours: { timezone, start: startHour, end: endHour, days },
      })
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .eq("status", "draft")
      .select("id")
      .single();

    if (updateErr || !updated) {
      setError("This campaign can no longer be edited because it has already been launched.");
      setSaving(false);
      return;
    }

    router.push(`/dashboard/${campaignId}`);
    router.refresh();
  }

  if (loading) {
    return <div className="text-sm text-[var(--color-text-muted)]">Loading campaign…</div>;
  }

  if (!isDraft) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Campaign Locked</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          This campaign has already been launched and can no longer be edited.
        </p>
        <Link
          href={`/dashboard/${campaignId}`}
          className="inline-block rounded-lg bg-[var(--color-cta)] px-4 py-2 text-sm font-medium text-[var(--color-cta-text)] transition-colors hover:bg-[var(--color-cta-hover)]"
        >
          Back to campaign
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/dashboard/${campaignId}`}
        className="mb-4 inline-block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        &larr; Back to campaign
      </Link>
      <h1 className="text-2xl font-semibold mb-6">Edit Campaign</h1>

      <section className="mb-8 space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6">
        <h2 className="text-lg font-medium text-[var(--color-text-primary,#111)]">Refine with AI</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Describe changes in plain language. The form below will update so you can review before saving.
        </p>
        <textarea
          value={nlRefinePrompt}
          onChange={(e) => setNlRefinePrompt(e.target.value)}
          rows={4}
          disabled={nlBusy || saving}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)] disabled:opacity-60"
          placeholder="Example: Add a pillar about competitors. Shorten the opener. Make tone more casual for college students."
        />
        {nlError && (
          <p className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger-strong)]">
            {nlError}
          </p>
        )}
        <button
          type="button"
          onClick={handleRefineWithAi}
          disabled={nlBusy || saving}
          className="rounded-lg bg-[var(--color-cta)] px-4 py-2 text-sm font-medium text-[var(--color-cta-text)] transition-colors hover:bg-[var(--color-cta-hover)] disabled:opacity-50"
        >
          {nlBusy ? "Updating…" : "Apply changes"}
        </button>
      </section>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 space-y-4">
          <h2 className="font-display text-lg font-medium">Basic Info</h2>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Campaign Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Research Context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
            />
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-lg font-medium">Pillar Questions</h2>
            <span className="text-sm text-[var(--color-text-muted)]">{pillars.length}/5</span>
          </div>
          {pillars.map((p, idx) => (
            <div key={idx} className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-label)]">Pillar {idx + 1}</span>
                {pillars.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePillar(idx)}
                    className="text-xs text-[var(--color-danger)] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                value={p.question}
                onChange={(e) => updatePillar(idx, "question", e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              />
              <textarea
                value={p.context}
                onChange={(e) => updatePillar(idx, "context", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
                placeholder="Optional learning goal for this question"
              />
            </div>
          ))}
          {pillars.length < 5 && (
            <button
              type="button"
              onClick={addPillar}
              className="text-sm text-[var(--color-label)] hover:underline"
            >
              + Add pillar
            </button>
          )}
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 space-y-4">
          <h2 className="font-display text-lg font-medium">Interview Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Interviewer Name</label>
              <input
                type="text"
                value={interviewerName}
                onChange={(e) => setInterviewerName(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Tone</label>
            <input
              type="text"
              value={toneStyle}
              onChange={(e) => setToneStyle(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">General Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                Max Interview Duration (seconds)
              </label>
              <input
                type="number"
                min={120}
                max={1800}
                value={maxDurationSec}
                onChange={(e) => setMaxDurationSec(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                Opening Sentence (Verbatim, Optional)
              </label>
              <input
                type="text"
                value={openingSentence}
                onChange={(e) => setOpeningSentence(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
                placeholder="If set, AI always uses this exact opener"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 space-y-4">
          <h2 className="font-display text-lg font-medium">Calling Hours</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Start</label>
              <input
                type="time"
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">End</label>
              <input
                type="time"
                value={endHour}
                onChange={(e) => setEndHour(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Days</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    days.includes(d.value)
                      ? "border-[var(--color-cta)] bg-[var(--color-cta)] text-[var(--color-cta-text)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-label)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <p className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger-strong)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-[var(--color-cta)] py-3 font-medium text-[var(--color-cta-text)] transition-colors hover:bg-[var(--color-cta-hover)] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
