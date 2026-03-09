"use client";

import { useState } from "react";

interface PillarSummary {
  pillarId: string;
  question: string;
  coverage: string;
  coveragePercent: number;
  sentimentDistribution: Record<string, number>;
  depthDistribution: Record<string, number>;
  sampleQuotes: string[];
}

interface AggregateAnalysis {
  campaignId: string;
  interviewsAnalyzed: number;
  completedSessions: number;
  pillars: PillarSummary[];
  topThemes: Array<{ theme: string; count: number }>;
  engagementDistribution: Record<string, number>;
  callQualityRates: Record<string, string>;
  notableQuotes: string[];
}

export function CampaignAnalysis({ campaignId }: { campaignId: string }) {
  const [analysis, setAnalysis] = useState<AggregateAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/analysis`);
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Failed to load analysis");
        return;
      }
      setAnalysis(body);
    } catch {
      setError("Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }

  const sentimentColor: Record<string, string> = {
    positive: "bg-green-100 text-green-700",
    negative: "bg-red-100 text-red-700",
    neutral: "bg-gray-100 text-gray-600",
    mixed: "bg-yellow-100 text-yellow-700",
  };

  if (!analysis) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Analysis
        </h3>
        <button
          onClick={loadAnalysis}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading..." : "Generate Analysis"}
        </button>
        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Aggregates insights across all completed and analyzed interviews.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Campaign Analysis
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {analysis.interviewsAnalyzed} of {analysis.completedSessions} interviews analyzed
          </span>
          <button
            onClick={loadAnalysis}
            disabled={loading}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Per-pillar coverage */}
      <div className="space-y-3">
        {analysis.pillars.map((p) => (
          <div
            key={p.pillarId}
            className="bg-white rounded-xl border border-gray-200 p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-gray-400">{p.pillarId}</span>
                <h4 className="text-sm font-medium text-gray-800 mt-0.5">{p.question}</h4>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-500">
                  {p.coverage} answered ({p.coveragePercent}%)
                </span>
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${p.coveragePercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(p.sentimentDistribution).map(([sentiment, count]) => (
                <span
                  key={sentiment}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    sentimentColor[sentiment] ?? sentimentColor.neutral
                  }`}
                >
                  {sentiment}: {count}
                </span>
              ))}
            </div>

            {p.sampleQuotes.length > 0 && (
              <div className="space-y-1">
                {p.sampleQuotes.slice(0, 3).map((q, qi) => (
                  <blockquote
                    key={qi}
                    className="text-xs text-gray-500 border-l-2 border-blue-200 pl-2 italic"
                  >
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Themes */}
      {analysis.topThemes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
            Top Themes
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.topThemes.map((t, i) => (
              <span
                key={i}
                className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium"
              >
                {t.theme} ({t.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Call quality rates */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
          Call Quality
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(analysis.callQualityRates).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </span>
              <span className="font-medium text-gray-800">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notable quotes */}
      {analysis.notableQuotes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
            Notable Quotes
          </h4>
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
