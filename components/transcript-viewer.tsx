"use client";

import { useState } from "react";

interface Transcript {
  id: string;
  transcript_type: string;
  content: string;
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
  transcripts: Transcript[];
  sessionId: string;
  dbTurns?: DbTurn[];
}

export function TranscriptViewer({ transcripts, sessionId, dbTurns = [] }: TranscriptViewerProps) {
  const plainText = transcripts.find((t) => t.transcript_type === "plain_text");
  const turns = transcripts.find((t) => t.transcript_type === "turns");
  const analysis = transcripts.find((t) => t.transcript_type === "vapi_analysis");
  const metrics = transcripts.find((t) => t.transcript_type === "call_metrics");

  const [tab, setTab] = useState<"transcript" | "analysis" | "raw">("transcript");

  function downloadTranscript() {
    const content = plainText?.content ?? "No transcript available";
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
        type: t.transcript_type,
        content: safeParseJSON(t.content),
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

  const parsedAnalysis = analysis ? safeParseJSON(analysis.content) : null;
  const parsedMetrics = metrics ? safeParseJSON(metrics.content) : null;

  let parsedTurns: any[] = [];
  if (turns) {
    const p = safeParseJSON(turns.content);
    if (Array.isArray(p)) parsedTurns = p;
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
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {(["transcript", "analysis", "raw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg capitalize ${
              tab === t ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Download */}
      <div className="flex gap-2">
        <button
          onClick={downloadTranscript}
          className="text-sm text-blue-600 hover:underline"
        >
          Download .txt
        </button>
        <button
          onClick={downloadJSON}
          className="text-sm text-blue-600 hover:underline"
        >
          Download .json
        </button>
      </div>

      {/* Tab Content */}
      {tab === "transcript" && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {displayTurns.length > 0 ? (
            displayTurns.map((turn, i) => (
                <div key={i} className="px-4 py-3 flex gap-3">
                  <div className="w-28 shrink-0 mt-0.5">
                    <span
                      className={`block text-xs font-medium uppercase ${
                        turn.speaker === "interviewer" ? "text-blue-600" : "text-gray-500"
                      }`}
                    >
                      {turn.speaker === "interviewer" ? "Interviewer" : "Interviewee"}
                    </span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      {formatTurnTimestamp(turn.startMs, turn.endMs)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))
          ) : plainText ? (
            <div className="p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {plainText.content}
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-400">No transcript available</div>
          )}
        </div>
      )}

      {tab === "analysis" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {parsedAnalysis ? (
            <>
              {parsedAnalysis.summary && (
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-1">Summary</h4>
                  <p className="text-sm text-gray-700">{parsedAnalysis.summary}</p>
                </div>
              )}
              {parsedAnalysis.successEvaluation && (
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-1">Evaluation</h4>
                  <p className="text-sm text-gray-700">{parsedAnalysis.successEvaluation}</p>
                </div>
              )}
              {parsedMetrics && (
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-1">Metrics</h4>
                  <pre className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 overflow-auto">
                    {JSON.stringify(parsedMetrics, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No analysis data available</p>
          )}
        </div>
      )}

      {tab === "raw" && (
        <pre className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-600 overflow-auto max-h-[600px]">
          {JSON.stringify(
            transcripts.map((t) => ({
              type: t.transcript_type,
              content: safeParseJSON(t.content),
            })),
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

function safeParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
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
  if (startMs == null) return "—";
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
