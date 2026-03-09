"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

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
    positive: "success",
    negative: "danger",
    neutral: "neutral",
    mixed: "warning",
  };

  if (!analysis) {
    return (
      <Card>
        <CardBody>
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
          Analysis
        </h3>
        <Button onClick={loadAnalysis} disabled={loading}>
          {loading ? "Loading..." : "Generate Analysis"}
        </Button>
        {error && (
          <Alert variant="danger" className="mt-2 text-xs">{error}</Alert>
        )}
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Aggregates insights across all completed and analyzed interviews.
        </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          Campaign Analysis
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-secondary)]">
            {analysis.interviewsAnalyzed} of {analysis.completedSessions} interviews analyzed
          </span>
          <button onClick={loadAnalysis} disabled={loading} className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Per-pillar coverage */}
      <div className="space-y-3">
        {analysis.pillars.map((p) => (
          <Card key={p.pillarId}>
            <CardBody className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">{p.pillarId}</span>
                <h4 className="text-sm font-medium text-[var(--color-text-primary)] mt-0.5">{p.question}</h4>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {p.coverage} answered ({p.coveragePercent}%)
                </span>
                <div className="w-16 h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)] rounded-full"
                    style={{ width: `${p.coveragePercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(p.sentimentDistribution).map(([sentiment, count]) => (
                <Badge key={sentiment} variant={(sentimentColor[sentiment] as any) ?? "neutral"}>
                  {sentiment}: {count}
                </Badge>
              ))}
            </div>

            {p.sampleQuotes.length > 0 && (
              <div className="space-y-1">
                {p.sampleQuotes.slice(0, 3).map((q, qi) => (
                  <blockquote
                    key={qi}
                    className="text-xs text-[var(--color-text-secondary)] border-l-2 border-[var(--color-info-border)] pl-2 italic"
                  >
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Themes */}
      {analysis.topThemes.length > 0 && (
        <Card>
          <CardBody className="p-4">
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Top Themes
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.topThemes.map((t, i) => (
              <Badge key={i} variant="info">
                {t.theme} ({t.count})
              </Badge>
            ))}
          </div>
          </CardBody>
        </Card>
      )}

      {/* Call quality rates */}
      <Card>
        <CardBody className="p-4">
        <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
          Call Quality
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(analysis.callQualityRates).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </span>
              <span className="font-medium text-[var(--color-text-primary)]">{val}</span>
            </div>
          ))}
        </div>
        </CardBody>
      </Card>

      {/* Notable quotes */}
      {analysis.notableQuotes.length > 0 && (
        <Card>
          <CardBody className="p-4">
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Notable Quotes
          </h4>
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
          </CardBody>
        </Card>
      )}
    </div>
  );
}
