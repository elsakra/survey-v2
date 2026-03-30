"use client";

export interface PillarInsight {
  pillarId: string;
  question: string;
  answered: boolean;
  participantAnswer: string;
  keyQuotes: string[];
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  depth: "surface" | "moderate" | "deep";
}

export interface PillarAnalysis {
  pillars: PillarInsight[];
  overallThemes: string[];
  notableQuotes: string[];
  participantEngagement: "high" | "moderate" | "low" | "disengaged";
  callQuality: {
    consentObtained: boolean;
    allPillarsAddressed: boolean;
    endedCleanly: boolean;
    interviewerStayedNeutral: boolean;
  };
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
  negative: "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
  neutral: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
  mixed: "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
};

const DEPTH_LABEL: Record<string, string> = {
  surface: "Surface-level",
  moderate: "Moderate depth",
  deep: "Deep insight",
};

export function AnalysisDisplay({ analysis }: { analysis: PillarAnalysis }) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">
          Pillar Analysis
        </h3>
        {analysis.pillars.map((p) => (
          <div
            key={p.pillarId}
            className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-mono text-[var(--color-text-muted)]">{p.pillarId}</span>
                <h4 className="text-sm font-medium text-[var(--color-text-primary)] mt-0.5">{p.question}</h4>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    p.answered ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
                  }`}
                >
                  {p.answered ? "Answered" : "Not answered"}
                </span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    SENTIMENT_COLOR[p.sentiment] ?? SENTIMENT_COLOR.neutral
                  }`}
                >
                  {p.sentiment}
                </span>
              </div>
            </div>

            {p.answered && (
              <>
                <p className="text-sm text-[var(--color-text-primary)]">{p.participantAnswer}</p>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {DEPTH_LABEL[p.depth] ?? p.depth}
                </div>
              </>
            )}

            {p.keyQuotes.length > 0 && (
              <div className="space-y-1.5">
                {p.keyQuotes.map((q, qi) => (
                  <blockquote
                    key={qi}
                    className="text-sm text-[var(--color-text-secondary)] border-l-2 border-[var(--color-info-border)] pl-3 italic"
                  >
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">
          Call Quality
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["consentObtained", "Consent obtained"],
              ["allPillarsAddressed", "All pillars addressed"],
              ["endedCleanly", "Ended cleanly"],
              ["interviewerStayedNeutral", "Interviewer stayed neutral"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  analysis.callQuality[key]
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
                    : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
                }`}
              >
                {analysis.callQuality[key] ? "\u2713" : "\u2717"}
              </span>
              <span className="text-[var(--color-text-primary)]">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-[var(--color-text-secondary)]">
          Participant engagement:{" "}
          <span className="font-medium text-[var(--color-text-primary)]">
            {analysis.participantEngagement}
          </span>
        </div>
      </div>

      {analysis.overallThemes.length > 0 && (
        <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">
            Themes
          </h3>
          <ul className="list-disc list-inside space-y-1">
            {analysis.overallThemes.map((theme, i) => (
              <li key={i} className="text-sm text-[var(--color-text-primary)]">{theme}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.notableQuotes.length > 0 && (
        <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-label)]">
            Notable Quotes
          </h3>
          <div className="space-y-2">
            {analysis.notableQuotes.map((q, i) => (
              <blockquote
                key={i}
                className="text-sm text-[var(--color-text-secondary)] border-l-2 border-[var(--color-info-border)] pl-3 italic"
              >
                &ldquo;{q}&rdquo;
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
