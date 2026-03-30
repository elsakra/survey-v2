"use client";

import { useState } from "react";
import { AnalysisDisplay, type PillarAnalysis } from "./analysis-display";

interface TranscriptRow {
  id: string;
  type: string;
  content_json: any;
  created_at: string;
}

interface DbTurn {
  turn_index: number;
  speaker: "agent" | "participant";
  prompt_text: string | null;
  response_text: string | null;
  start_ms: number | null;
  end_ms: number | null;
}

interface NormalizedTurn {
  speaker: "interviewer" | "interviewee";
  text: string;
  startMs: number | null;
  endMs: number | null;
}

interface TranscriptViewerProps {
  transcripts: TranscriptRow[];
  sessionId: string;
  dbTurns?: DbTurn[];
}

function getContent(row: TranscriptRow): any {
  const cj = row.content_json;
  if (typeof cj === "string") {
    try { return JSON.parse(cj); } catch { return cj; }
  }
  return cj;
}

export function TranscriptViewer({ transcripts, sessionId, dbTurns = [] }: TranscriptViewerProps) {
  const plainTextRow = transcripts.find((t) => t.type === "plain_text");
  const turnsRow = transcripts.find((t) => t.type === "turns");
  const analysisRow = transcripts.find((t) => t.type === "vapi_analysis");
  const metricsRow = transcripts.find((t) => t.type === "call_metrics");
  const pillarRow = transcripts.find((t) => t.type === "pillar_analysis");

  const [tab, setTab] = useState<"transcript" | "analysis" | "raw">("transcript");

  const plainTextContent = plainTextRow ? getContent(plainTextRow) : null;
  const plainText = typeof plainTextContent === "string"
    ? plainTextContent
    : plainTextContent?.text ?? null;

  function downloadTranscript() {
    const content = plainText ?? "No transcript available";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadJSON() {
    const data = {
      sessionId,
      transcripts: transcripts.map((t) => ({
        type: t.type,
        content: getContent(t),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const parsedAnalysis = analysisRow ? getContent(analysisRow) : null;
  const parsedMetrics = metricsRow ? getContent(metricsRow) : null;
  const pillarAnalysis: PillarAnalysis | null = pillarRow ? getContent(pillarRow) : null;

  let parsedTurns: any[] = [];
  if (turnsRow) {
    const p = getContent(turnsRow);
    if (Array.isArray(p)) parsedTurns = p;
    else if (p?.turns && Array.isArray(p.turns)) parsedTurns = p.turns;
  }

  const normalizedDbTurns: NormalizedTurn[] = dbTurns
    .map((turn) => {
      const text =
        turn.speaker === "agent"
          ? (turn.prompt_text ?? "").trim()
          : (turn.response_text ?? "").trim();
      if (!text) return null;
      return {
        speaker: turn.speaker === "agent" ? "interviewer" : "interviewee",
        text,
        startMs: turn.start_ms ?? null,
        endMs: turn.end_ms ?? null,
      } as NormalizedTurn;
    })
    .filter((turn): turn is NormalizedTurn => Boolean(turn));

  const normalizedParsedTurns: NormalizedTurn[] = parsedTurns
    .map((turn) => {
      const normalizedRole = normalizeRole(turn);
      if (normalizedRole === "system") return null;
      const text = String(turn.content ?? turn.text ?? turn.transcript ?? "").trim();
      if (!text) return null;
      const startMs = pickNumber(turn.startMs, turn.start_ms, turn.secondsFromStart != null ? Number(turn.secondsFromStart) * 1000 : null);
      const endMs = pickNumber(turn.endMs, turn.end_ms);
      return {
        speaker: normalizedRole === "interviewer" ? "interviewer" : "interviewee",
        text,
        startMs,
        endMs,
      } as NormalizedTurn;
    })
    .filter((turn): turn is NormalizedTurn => Boolean(turn));

  const displayTurns = normalizedDbTurns.length > 0 ? normalizedDbTurns : normalizedParsedTurns;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-[var(--color-border)] pb-2">
        {(["transcript", "analysis", "raw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg capitalize ${
              tab === t ? "bg-[var(--color-accent-soft)] text-[var(--color-label)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={downloadTranscript} className="text-sm text-[var(--color-label)] hover:underline">
          Download .txt
        </button>
        <button onClick={downloadJSON} className="text-sm text-[var(--color-label)] hover:underline">
          Download .json
        </button>
      </div>

      {tab === "transcript" && (
        <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border-subtle)] max-h-[600px] overflow-y-auto">
          {displayTurns.length > 0 ? (
            displayTurns.map((turn, i) => (
              <div key={i} className="px-4 py-3 flex gap-3">
                <div className="w-28 shrink-0 mt-0.5">
                  <span
                    className={`block text-xs font-medium uppercase ${
                      turn.speaker === "interviewer" ? "text-[var(--color-label)]" : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {turn.speaker === "interviewer" ? "Interviewer" : "Interviewee"}
                  </span>
                  <span className="block text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {formatTurnTimestamp(turn.startMs, turn.endMs)}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{turn.text}</p>
              </div>
            ))
          ) : plainText ? (
            <div className="p-4 text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{plainText}</div>
          ) : (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">No transcript available</div>
          )}
        </div>
      )}

      {tab === "analysis" && (
        <div className="space-y-6">
          {pillarAnalysis && <AnalysisDisplay analysis={pillarAnalysis} />}

          {parsedAnalysis && (
            <details open={!pillarAnalysis}>
              <summary className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider cursor-pointer select-none">
                Vapi Auto-Analysis
              </summary>
              <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5 space-y-4 mt-2">
                {parsedAnalysis.summary && (
                  <div>
                    <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">Summary</h4>
                    <p className="text-sm text-[var(--color-text-primary)]">{parsedAnalysis.summary}</p>
                  </div>
                )}
                {parsedAnalysis.successEvaluation && (
                  <div>
                    <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">Evaluation</h4>
                    <p className="text-sm text-[var(--color-text-primary)]">{parsedAnalysis.successEvaluation}</p>
                  </div>
                )}
              </div>
            </details>
          )}

          {parsedMetrics && (
            <details>
              <summary className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider cursor-pointer select-none">
                Call Metrics
              </summary>
              <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-subtle)] rounded-lg p-3 overflow-auto mt-2">
                {JSON.stringify(parsedMetrics, null, 2)}
              </pre>
            </details>
          )}

          {!parsedAnalysis && !pillarAnalysis && (
            <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-sm text-[var(--color-text-muted)]">No analysis data available</p>
            </div>
          )}
        </div>
      )}

      {tab === "raw" && (
        <pre className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-4 text-xs text-[var(--color-text-secondary)] overflow-auto max-h-[600px]">
          {JSON.stringify(
            transcripts.map((t) => ({
              type: t.type,
              content: getContent(t),
            })),
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

function pickNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
  }
  return null;
}

function normalizeRole(turn: any): "interviewer" | "interviewee" | "system" {
  const role = String(turn.role ?? turn.speaker ?? "").toLowerCase();
  if (role.includes("system")) return "system";
  if (role.includes("assistant") || role.includes("agent") || role.includes("bot")) {
    return "interviewer";
  }
  return "interviewee";
}

function formatTurnTimestamp(startMs: number | null, endMs: number | null): string {
  if (startMs == null) return "\u2014";
  const toClock = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };
  const start = toClock(startMs);
  if (endMs != null && endMs >= startMs) {
    return `${start} - ${toClock(endMs)}`;
  }
  return start;
}
