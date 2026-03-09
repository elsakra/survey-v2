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
  positive: "bg-green-100 text-green-700",
  negative: "bg-red-100 text-red-700",
  neutral: "bg-gray-100 text-gray-600",
  mixed: "bg-yellow-100 text-yellow-700",
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
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Pillar Analysis
        </h3>
        {analysis.pillars.map((p) => (
          <div
            key={p.pillarId}
            className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-mono text-gray-400">{p.pillarId}</span>
                <h4 className="text-sm font-medium text-gray-800 mt-0.5">{p.question}</h4>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    p.answered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
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
                <p className="text-sm text-gray-700">{p.participantAnswer}</p>
                <div className="text-xs text-gray-500">
                  {DEPTH_LABEL[p.depth] ?? p.depth}
                </div>
              </>
            )}

            {p.keyQuotes.length > 0 && (
              <div className="space-y-1.5">
                {p.keyQuotes.map((q, qi) => (
                  <blockquote
                    key={qi}
                    className="text-sm text-gray-600 border-l-2 border-blue-300 pl-3 italic"
                  >
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
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
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {analysis.callQuality[key] ? "\u2713" : "\u2717"}
              </span>
              <span className="text-gray-700">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Participant engagement:{" "}
          <span className="font-medium text-gray-700">
            {analysis.participantEngagement}
          </span>
        </div>
      </div>

      {analysis.overallThemes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
            Themes
          </h3>
          <ul className="list-disc list-inside space-y-1">
            {analysis.overallThemes.map((theme, i) => (
              <li key={i} className="text-sm text-gray-700">{theme}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.notableQuotes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
            Notable Quotes
          </h3>
          <div className="space-y-2">
            {analysis.notableQuotes.map((q, i) => (
              <blockquote
                key={i}
                className="text-sm text-gray-600 border-l-2 border-blue-300 pl-3 italic"
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
