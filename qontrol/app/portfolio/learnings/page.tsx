"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Dot,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  DecisionEcho,
  DecisionEchoDirection,
  InsightsPayload,
  Recommendation,
  RecommendationAction,
  Severity,
  Signal,
} from "@/lib/portfolio-insights/types";
import type {
  ArticleDefectRate,
  BatchCohort,
  CostRibbonPoint,
  LagShift,
  OperatorConcentration,
  SectionCount,
} from "@/lib/learnings-data";
import type {
  AnomalyCandidate,
  PastDecisionWithImpact,
} from "@/lib/portfolio-insights/context";
import { CHART_COLORS, CHART_SERIES } from "@/lib/chart-theme";
import { openInsightsChat } from "@/lib/client/insights-chat";

type Toast = { kind: "success" | "error"; text: string } | null;

/** Key for tracking which (rec, action) pair has been logged. */
function logKey(recId: string, actionId?: string | null): string {
  return actionId ? `${recId}::${actionId}` : recId;
}

export default function PortfolioInsightsPage() {
  const [payload, setPayload] = useState<InsightsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [deckFor, setDeckFor] = useState<string | null>(null);
  const [loggedInitiativeIds, setLoggedInitiativeIds] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portfolio/insights", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as InsightsPayload;
        if (!cancelled) setPayload(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function logAsInitiative(
    rec: Recommendation,
    action?: RecommendationAction,
  ) {
    const key = logKey(rec.id, action?.id);
    setCreatingFor(key);
    try {
      const res = await fetch("/api/portfolio/insights/initiative", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recommendation: rec,
          action_id: action?.id ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      if (json.initiative_id) {
        setLoggedInitiativeIds((prev) => ({ ...prev, [key]: json.initiative_id }));
      }
      setToast({
        kind: "success",
        text: action
          ? `Logged "${action.label}" as ${json.initiative_id}.`
          : `Logged as ${json.initiative_id}. It now shows up under Initiatives.`,
      });
    } catch (e) {
      setToast({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to log initiative",
      });
    } finally {
      setCreatingFor(null);
    }
  }

  async function generateDeck(rec: Recommendation, initiativeId?: string) {
    setDeckFor(rec.id);
    try {
      const res = await fetch("/api/portfolio/insights/deck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recommendation: rec, initiative_id: initiativeId ?? null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      window.open(json.deck_url, "_blank", "noopener");
      setToast({ kind: "success", text: "Deck ready in a new tab." });
    } catch (e) {
      setToast({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to build deck",
      });
    } finally {
      setDeckFor(null);
    }
  }

  const topRecommendation = useMemo<Recommendation | null>(() => {
    if (!payload) return null;
    const confidenceOrder: Record<string, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    return (
      [...payload.recommendations].sort(
        (a, b) =>
          (confidenceOrder[a.confidence] ?? 9) -
          (confidenceOrder[b.confidence] ?? 9),
      )[0] ?? null
    );
  }, [payload]);

  const topLinkedDecision = useMemo<PastDecisionWithImpact | null>(() => {
    if (!payload || !topRecommendation) return null;
    return findLinkedDecision(topRecommendation, payload.context.past_decisions);
  }, [payload, topRecommendation]);

  const otherRecommendations = useMemo<Recommendation[]>(() => {
    if (!payload || !topRecommendation) return payload?.recommendations ?? [];
    return payload.recommendations.filter((r) => r.id !== topRecommendation.id);
  }, [payload, topRecommendation]);

  const fallbackHeadlineSignal = useMemo<Signal | null>(() => {
    if (!payload || topRecommendation) return null;
    const order: Severity[] = ["critical", "high", "medium", "low"];
    return (
      [...payload.signals].sort(
        (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
      )[0] ?? null
    );
  }, [payload, topRecommendation]);

  return (
    <main className="page-shell" style={{ paddingBottom: 80 }}>
      <section className="hero-strip">
        <div>
          <p className="eyebrow">QM Portfolio</p>
          <h1>Portfolio Insights</h1>
          <p className="hero-copy">
            Portfolio-wide view of quality this month, what we did about it last time,
            and what we should consider doing next. Every number is grounded in the data.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "flex-start" }}>
          {payload ? (
            <span className={`badge badge-${payload.mode === "llm" ? "success" : "neutral"}`}>
              {payload.mode === "llm" ? `LLM \u00B7 ${payload.model ?? "gpt"}` : "Heuristic fallback"}
            </span>
          ) : null}
        </div>
      </section>

      {err ? (
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)" }}>{err}</p>
        </div>
      ) : null}

      {!payload && !err ? (
        <div className="pf-learnings-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="pf-skeleton" style={{ height: 220 }} />
          ))}
        </div>
      ) : null}

      {payload ? (
        <>
          {topRecommendation ? (
            <TopRecommendationBanner
              recommendation={topRecommendation}
              decision={topLinkedDecision}
              onLog={logAsInitiative}
              onDeck={generateDeck}
              creatingFor={creatingFor}
              deckFor={deckFor}
              loggedIds={loggedInitiativeIds}
            />
          ) : fallbackHeadlineSignal ? (
            <FallbackSignalBanner signal={fallbackHeadlineSignal} />
          ) : null}

          <ContextRibbon payload={payload} />

          <SignalsGrid payload={payload} />

          <DecisionLedger payload={payload} />

          <RecommendationsGrid
            recommendations={otherRecommendations}
            pastDecisions={payload.context.past_decisions}
            onLog={logAsInitiative}
            onDeck={generateDeck}
            creatingFor={creatingFor}
            deckFor={deckFor}
            loggedIds={loggedInitiativeIds}
          />

          <StableKpis payload={payload} />
        </>
      ) : null}

      <button
        type="button"
        onClick={openInsightsChat}
        aria-label="Open insights chat"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          padding: "12px 18px",
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-primary)",
          boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          zIndex: 900,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--success)" }} />
        Ask the agent
      </button>

      {toast ? (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            padding: "12px 16px",
            borderRadius: 8,
            background:
              toast.kind === "success"
                ? "var(--success-muted, rgba(34,197,94,0.15))"
                : "var(--danger-muted, rgba(239,68,68,0.15))",
            border: `1px solid var(--${toast.kind === "success" ? "success" : "danger"})`,
            color: "var(--text-primary)",
            maxWidth: 380,
            fontSize: 13,
            lineHeight: 1.4,
            zIndex: 1000,
          }}
        >
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}

// -----------------------------------------------------------------------------
// Hero: Top Recommendation banner with 2-3 action CTAs
// -----------------------------------------------------------------------------

function TopRecommendationBanner({
  recommendation,
  decision,
  onLog,
  onDeck,
  creatingFor,
  deckFor,
  loggedIds,
}: {
  recommendation: Recommendation;
  decision: PastDecisionWithImpact | null;
  onLog: (rec: Recommendation, action?: RecommendationAction) => void;
  onDeck: (rec: Recommendation, initiativeId?: string) => void;
  creatingFor: string | null;
  deckFor: string | null;
  loggedIds: Record<string, string>;
}) {
  const confidenceTone =
    recommendation.confidence === "high"
      ? "success"
      : recommendation.confidence === "low"
        ? "neutral"
        : "warning";
  const primaryRecId = logKey(recommendation.id);
  const primaryLogged = loggedIds[primaryRecId];
  return (
    <section
      className="card-surface panel pf-learning-high"
      style={{ display: "grid", gap: 18 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Top recommendation</p>
          <h2 style={{ margin: "4px 0" }}>{recommendation.title}</h2>
          <p className="eyebrow" style={{ margin: "2px 0 0" }}>
            {formatKind(recommendation.kind)} · {recommendation.estimated_cost}
          </p>
        </div>
        <span className={`badge badge-${confidenceTone}`}>
          {recommendation.confidence} confidence
        </span>
      </div>

      <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.55 }}>
        {recommendation.reasoning}
      </p>

      {recommendation.actions.length > 0 ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Action items ({recommendation.actions.length})
          </p>
          {recommendation.actions.map((a, i) => {
            const key = logKey(recommendation.id, a.id);
            const logged = loggedIds[key];
            return (
              <div
                key={a.id}
                className="card-surface"
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto",
                  gap: 12,
                  padding: 12,
                  background: "var(--surface-subtle)",
                  alignItems: "start",
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: i === 0 ? "var(--accent, #0b5394)" : "var(--surface)",
                    color: i === 0 ? "white" : "var(--text-primary)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>{a.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                    {a.detail}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {formatKind(a.kind)} · {a.estimated_cost}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ whiteSpace: "nowrap", fontSize: 12 }}
                  disabled={creatingFor === key || Boolean(logged)}
                  onClick={() => onLog(recommendation, a)}
                >
                  {creatingFor === key
                    ? "Logging..."
                    : logged
                      ? `Logged ${logged}`
                      : "Log this"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="ghost-button"
          disabled={creatingFor === primaryRecId || Boolean(primaryLogged)}
          onClick={() => onLog(recommendation)}
        >
          {creatingFor === primaryRecId
            ? "Logging..."
            : primaryLogged
              ? `Recommendation logged as ${primaryLogged}`
              : "Log full recommendation"}
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={deckFor === recommendation.id}
          onClick={() => onDeck(recommendation, primaryLogged)}
        >
          {deckFor === recommendation.id ? "Building deck..." : "Open deck"}
        </button>
      </div>

      {decision ? (
        <div
          className="card-surface"
          style={{
            padding: 16,
            background: "var(--surface-subtle)",
            display: "grid",
            gap: 6,
          }}
        >
          <p className="eyebrow" style={{ margin: 0 }}>
            Echoes past decision: {decision.initiative_id}
          </p>
          <p style={{ margin: 0, fontWeight: 600 }}>{decision.title}</p>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
            {decision.reasoning}
          </p>
          {decision.impact && !decision.impact.insufficient_data ? (
            <ImpactSpark
              points={decision.impact.trajectory_points}
              label={decision.impact.target_kpi_label}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FallbackSignalBanner({ signal }: { signal: Signal }) {
  return (
    <section
      className={`card-surface panel ${severityRing(signal.severity)}`}
      style={{ display: "grid", gap: 12 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Top signal (no recommendation yet)</p>
          <h2 style={{ margin: "4px 0" }}>{signal.title}</h2>
        </div>
        <span className={`badge badge-${badgeTone(signal.severity)}`}>{signal.severity}</span>
      </div>
      <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.55 }}>
        {signal.caption}
      </p>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Cost ribbon - stacked bar + big readout
// -----------------------------------------------------------------------------

function ContextRibbon({ payload }: { payload: InsightsPayload }) {
  const ribbon = payload.context.baselines.cost_ribbon;
  const stats = useMemo(() => {
    const anomCount = payload.context.anomaly_candidates.length;
    const articleHot = payload.context.baselines.article_rates.filter((r) => r.is_anomaly).length;
    const batchHot = payload.context.baselines.batch_cohorts.filter((r) => r.is_anomaly).length;
    return { anomCount, articleHot, batchHot };
  }, [payload]);

  const trimmedTrajectory = useMemo(
    () => ribbon.trajectory.slice(-16),
    [ribbon.trajectory],
  );

  const deltaTone: "danger" | "success" | "neutral" =
    ribbon.delta_pct >= 25 ? "danger" : ribbon.delta_pct <= -10 ? "success" : "neutral";

  return (
    <section className="pf-section" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Stat label="Anomaly signals" value={String(stats.anomCount)} />
        <Stat label="Articles w/ rate spike" value={String(stats.articleHot)} />
        <Stat label="Batch cohorts flagged" value={String(stats.batchHot)} />
        <Stat
          label="Past decisions tracked"
          value={String(payload.context.past_decisions.length)}
        />
      </div>

      <div className="card-surface panel" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Weekly quality cost</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
              Defects + claims + rework, summed per week. October 2025 is the baseline.
            </p>
          </div>
          <CostReadout ribbon={ribbon} deltaTone={deltaTone} />
        </div>

        <CostRibbonBreakdownChart
          data={trimmedTrajectory}
          octBaseline={ribbon.oct_baseline}
        />

        <CostLegend />
      </div>
    </section>
  );
}

function CostReadout({
  ribbon,
  deltaTone,
}: {
  ribbon: { current_weekly: number; oct_baseline: number; delta_pct: number; delta_usd: number };
  deltaTone: "danger" | "success" | "neutral";
}) {
  const color =
    deltaTone === "danger"
      ? "var(--danger)"
      : deltaTone === "success"
        ? "var(--success)"
        : "var(--text-muted)";
  const signPct = ribbon.delta_pct >= 0 ? "+" : "";
  const signUsd = ribbon.delta_usd >= 0 ? "+" : "-";
  return (
    <div style={{ textAlign: "right", display: "grid", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        This week
      </span>
      <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {formatUsd(ribbon.current_weekly)}
      </span>
      <span style={{ fontSize: 12, color, fontVariantNumeric: "tabular-nums" }}>
        {signPct}
        {ribbon.delta_pct.toFixed(0)}% ({signUsd}
        {formatUsd(Math.abs(ribbon.delta_usd))}) vs Oct avg {formatUsd(ribbon.oct_baseline)}
      </span>
    </div>
  );
}

const COST_COLORS = {
  defects: CHART_COLORS.barPrimary,
  claims: CHART_COLORS.defectLine,
  rework: CHART_SERIES[3],
};

function CostRibbonBreakdownChart({
  data,
  octBaseline,
}: {
  data: CostRibbonPoint[];
  octBaseline: number;
}) {
  if (!data.length) return <p className="chart-empty">No cost data in range.</p>;
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="week_start"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={((v: number, name: string) => [formatUsd(v), name]) as never}
            labelFormatter={((l: string) => `Week of ${l}`) as never}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="defects_cost"
            name="Defects"
            stackId="cost"
            fill={COST_COLORS.defects}
          />
          <Bar
            dataKey="claims_cost"
            name="Claims"
            stackId="cost"
            fill={COST_COLORS.claims}
          />
          <Bar
            dataKey="rework_cost"
            name="Rework"
            stackId="cost"
            fill={COST_COLORS.rework}
            radius={[4, 4, 0, 0]}
          />
          {octBaseline > 0 ? (
            <ReferenceLine
              y={octBaseline}
              stroke={CHART_COLORS.referenceLine}
              strokeDasharray="4 4"
              label={{
                value: `Oct baseline ${formatUsd(octBaseline)}`,
                position: "insideTopRight",
                fill: CHART_COLORS.referenceLine,
                fontSize: 11,
              }}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CostLegend() {
  return (
    <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
      <strong style={{ color: COST_COLORS.defects }}>Defects</strong> = on-line rework cost attached to the defect event.
      <strong style={{ marginLeft: 10, color: COST_COLORS.claims }}>Claims</strong> = booked cost of field-return claims
      (settlement + logistics).
      <strong style={{ marginLeft: 10, color: COST_COLORS.rework }}>Rework</strong> = standalone rework events not tied to
      a specific defect code.
    </p>
  );
}

// -----------------------------------------------------------------------------
// Signals Grid
// -----------------------------------------------------------------------------

function SignalsGrid({ payload }: { payload: InsightsPayload }) {
  const candidatesById = useMemo(() => {
    const map = new Map<string, AnomalyCandidate>();
    for (const c of payload.context.anomaly_candidates) {
      const id = signalIdFor(c);
      map.set(id, c);
    }
    return map;
  }, [payload]);

  if (!payload.signals.length) {
    return (
      <section className="pf-section">
        <div className="card-surface panel">
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            No portfolio-level anomalies detected this week. Stable KPIs below.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="pf-section">
      <div className="panel-header" style={{ paddingLeft: 4 }}>
        <h3>Signals</h3>
        <p>Each card is a portfolio-level anomaly grounded in evidence.</p>
      </div>
      <div className="pf-learnings-grid">
        {payload.signals.map((s) => (
          <SignalCard
            key={s.id}
            signal={s}
            candidate={candidatesById.get(s.id) ?? null}
            decision={
              s.linked_past_decision_id
                ? payload.context.past_decisions.find(
                    (d) => d.initiative_id === s.linked_past_decision_id,
                  ) ?? null
                : null
            }
          />
        ))}
      </div>
    </section>
  );
}

function SignalCard({
  signal,
  candidate,
  decision,
}: {
  signal: Signal;
  candidate: AnomalyCandidate | null;
  decision: PastDecisionWithImpact | null;
}) {
  return (
    <div className={`card-surface panel pf-learning-card ${severityRing(signal.severity)}`} id={signal.id}>
      <div className="pf-learning-top">
        <h3>{signal.title}</h3>
        <span className={`badge badge-${badgeTone(signal.severity)}`}>{signal.severity}</span>
      </div>
      <p className="pf-learning-story">{signal.caption}</p>
      {candidate ? <SignalMicroViz candidate={candidate} /> : null}
      {decision ? (
        <div
          className="card-surface"
          style={{ padding: 12, marginTop: 12, background: "var(--surface-subtle)" }}
        >
          <p className="eyebrow" style={{ margin: 0 }}>Echoes: {decision.initiative_id}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {decision.title}
          </p>
        </div>
      ) : null}
      <EvidenceChips refs={signal.evidence_refs} />
    </div>
  );
}

function SignalMicroViz({ candidate }: { candidate: AnomalyCandidate }) {
  if (candidate.kind === "article_rate") {
    const r = candidate as ArticleDefectRate;
    return (
      <MicroStats
        rows={[
          ["4wk rate", `${(r.rate_4wk * 100).toFixed(2)}%`],
          ["12wk median", `${(r.median_12wk * 100).toFixed(2)}%`],
          ["Delta", `${r.delta_pct >= 0 ? "+" : ""}${r.delta_pct.toFixed(0)}%`],
        ]}
      />
    );
  }
  if (candidate.kind === "section_count") {
    const s = candidate as SectionCount;
    return (
      <MicroStats
        rows={[
          ["Last 4wk count", String(s.count_4wk)],
          ["Weekly avg (12wk)", s.mean_12wk.toFixed(1)],
          ["Z-score", s.z_score.toFixed(1)],
        ]}
      />
    );
  }
  if (candidate.kind === "batch_cohort") {
    const b = candidate as BatchCohort;
    return (
      <MicroStats
        rows={[
          ["Batch rate", `${(b.batch_rate * 100).toFixed(1)}%`],
          ["Peer median", `${(b.supplier_peer_median_rate * 100).toFixed(1)}%`],
          ["Multiple", `${b.multiple.toFixed(1)}x`],
          ["Products", String(b.batch_products)],
        ]}
      />
    );
  }
  if (candidate.kind === "lag_shift") {
    const l = candidate as LagShift;
    const rows = (["0-4 wk", "4-8 wk", "8-12 wk", "12+ wk"] as const).map(
      (bucket) =>
        [
          bucket,
          `this ${l.this_month_dist[bucket]} \u00B7 prior ${l.trailing_3mo_dist[bucket]}`,
        ] as [string, string],
    );
    return <MicroStats rows={rows} />;
  }
  const op = candidate as OperatorConcentration;
  return (
    <MicroStats
      rows={[
        ["Top operator", op.top_operator],
        ["Share of rework", `${(op.share * 100).toFixed(0)}%`],
        ["Top codes", op.top_defect_codes.join(", ") || "-"],
      ]}
    />
  );
}

function MicroStats({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 12, marginTop: 8 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents", fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>{k}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Decision Ledger
// -----------------------------------------------------------------------------

function DecisionLedger({ payload }: { payload: InsightsPayload }) {
  const echoes = useMemo(() => {
    const byId = new Map<string, DecisionEcho>();
    for (const e of payload.decision_echoes) byId.set(e.initiative_id, e);
    return byId;
  }, [payload]);

  if (!payload.context.past_decisions.length) return null;

  return (
    <section className="pf-section">
      <div className="panel-header" style={{ paddingLeft: 4 }}>
        <h3>Decision ledger</h3>
        <p>Past initiatives and the measured effect on their target KPI.</p>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {payload.context.past_decisions.map((d) => {
          const echo = echoes.get(d.initiative_id);
          return (
            <div key={d.initiative_id} className="card-surface panel" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <p className="eyebrow" style={{ margin: 0 }}>
                    {d.initiative_id} · {formatKind(d.kind)} · {d.status}
                  </p>
                  <h4 style={{ margin: "4px 0" }}>{d.title}</h4>
                </div>
                {echo ? (
                  <span className={`badge badge-${directionTone(echo.direction)}`}>
                    {directionLabel(echo.direction)}
                  </span>
                ) : null}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                {echo?.narrative ?? d.reasoning}
              </p>
              {d.impact && !d.impact.insufficient_data ? (
                <ImpactSpark
                  points={d.impact.trajectory_points}
                  label={d.impact.target_kpi_label}
                />
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                  Not enough pre/post data to quantify impact.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ImpactSpark({
  points,
  label,
}: {
  points: { week_start: string; value: number; is_post: boolean }[];
  label: string;
}) {
  if (!points.length) return null;
  const effectiveIdx = points.findIndex((p) => p.is_post);
  const effectiveWeek = effectiveIdx >= 0 ? points[effectiveIdx].week_start : null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{label}</p>
      <div style={{ height: 80 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="week_start" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={((v: number) => [typeof v === "number" ? v.toFixed(3) : v, "Value"]) as never}
              labelFormatter={((l: string) => `Week of ${l}`) as never}
            />
            {effectiveWeek ? (
              <ReferenceLine
                x={effectiveWeek}
                stroke="var(--success)"
                strokeDasharray="3 3"
                label={{ value: "effective", position: "top", fill: "var(--success)", fontSize: 10 }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--text-primary)"
              strokeWidth={2}
              dot={<TrajectoryDot />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrajectoryDot(props: {
  cx?: number;
  cy?: number;
  payload?: { is_post: boolean };
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={3}
      fill={payload?.is_post ? "var(--success)" : "var(--text-muted)"}
      stroke="none"
    />
  );
}

// -----------------------------------------------------------------------------
// Recommendations Grid (non-hero recommendations)
// -----------------------------------------------------------------------------

function RecommendationsGrid({
  recommendations,
  pastDecisions,
  onLog,
  onDeck,
  creatingFor,
  deckFor,
  loggedIds,
}: {
  recommendations: Recommendation[];
  pastDecisions: PastDecisionWithImpact[];
  onLog: (rec: Recommendation, action?: RecommendationAction) => void;
  onDeck: (rec: Recommendation, initiativeId?: string) => void;
  creatingFor: string | null;
  deckFor: string | null;
  loggedIds: Record<string, string>;
}) {
  if (!recommendations.length) return null;
  return (
    <section className="pf-section">
      <div className="panel-header" style={{ paddingLeft: 4 }}>
        <h3>More recommendations</h3>
        <p>Other forward-looking initiatives the agent is proposing. Each has 2-3 action items.</p>
      </div>
      <div className="pf-learnings-grid">
        {recommendations.map((r) => {
          const decision = findLinkedDecision(r, pastDecisions);
          const primaryKey = logKey(r.id);
          const primaryLogged = loggedIds[primaryKey];
          return (
            <div key={r.id} className="card-surface panel pf-learning-card">
              <div className="pf-learning-top">
                <h3>{r.title}</h3>
                <span
                  className={`badge badge-${r.confidence === "high" ? "success" : r.confidence === "low" ? "neutral" : "warning"}`}
                >
                  {r.confidence} confidence
                </span>
              </div>
              <p className="eyebrow" style={{ marginTop: 4 }}>
                {formatKind(r.kind)} · {r.estimated_cost}
              </p>
              <p className="pf-learning-story">{r.reasoning}</p>

              {r.actions.length > 0 ? (
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <p className="eyebrow" style={{ margin: 0 }}>
                    Actions ({r.actions.length})
                  </p>
                  {r.actions.map((a) => {
                    const key = logKey(r.id, a.id);
                    const logged = loggedIds[key];
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          alignItems: "center",
                          padding: "6px 10px",
                          background: "var(--surface-subtle)",
                          borderRadius: 6,
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</span>
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: 11,
                              color: "var(--text-muted)",
                              lineHeight: 1.4,
                            }}
                          >
                            {a.detail}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}
                          disabled={creatingFor === key || Boolean(logged)}
                          onClick={() => onLog(r, a)}
                        >
                          {creatingFor === key
                            ? "..."
                            : logged
                              ? logged
                              : "Log"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {decision ? (
                <div
                  className="card-surface"
                  style={{
                    padding: 10,
                    marginTop: 10,
                    background: "var(--surface-subtle)",
                  }}
                >
                  <p className="eyebrow" style={{ margin: 0 }}>
                    Echoes: {decision.initiative_id}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                    {decision.title}
                  </p>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={creatingFor === primaryKey || Boolean(primaryLogged)}
                  onClick={() => onLog(r)}
                >
                  {creatingFor === primaryKey
                    ? "Logging..."
                    : primaryLogged
                      ? `Logged as ${primaryLogged}`
                      : "Log full recommendation"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={deckFor === r.id}
                  onClick={() => onDeck(r, primaryLogged)}
                >
                  {deckFor === r.id ? "Building deck..." : "Open deck"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Stable KPIs
// -----------------------------------------------------------------------------

function StableKpis({ payload }: { payload: InsightsPayload }) {
  const stable = payload.context.baselines.article_rates
    .filter((r) => !r.is_anomaly)
    .slice(0, 8);
  const sections = payload.context.baselines.section_counts
    .filter((s) => !s.is_anomaly || s.is_detection_station)
    .slice(0, 8);

  return (
    <section className="pf-section" style={{ display: "grid", gap: 12 }}>
      <div className="panel-header" style={{ paddingLeft: 4 }}>
        <h3>Stable KPIs</h3>
        <p>Baselines currently within expected range. Shown for context, not alerted on.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
        <div className="card-surface panel">
          <h4 style={{ margin: "0 0 8px" }}>Article defect rates</h4>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th style={{ textAlign: "right" }}>4wk</th>
                  <th style={{ textAlign: "right" }}>12wk median</th>
                  <th style={{ textAlign: "right" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {stable.map((r) => (
                  <tr key={r.article_id}>
                    <td>{r.article_name}</td>
                    <td style={{ textAlign: "right" }}>{(r.rate_4wk * 100).toFixed(2)}%</td>
                    <td style={{ textAlign: "right" }}>{(r.median_12wk * 100).toFixed(2)}%</td>
                    <td style={{ textAlign: "right" }}>
                      {r.delta_pct >= 0 ? "+" : ""}
                      {r.delta_pct.toFixed(0)}%
                    </td>
                  </tr>
                ))}
                {stable.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-muted)" }}>
                      No stable articles in range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-surface panel">
          <h4 style={{ margin: "0 0 8px" }}>Section weekly counts</h4>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th style={{ textAlign: "right" }}>4wk total</th>
                  <th style={{ textAlign: "right" }}>Weekly avg</th>
                  <th style={{ textAlign: "right" }}>Z</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.section_name}>
                    <td>
                      {s.section_name}
                      {s.is_detection_station ? (
                        <span className="badge badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>
                          detection
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>{s.count_4wk}</td>
                    <td style={{ textAlign: "right" }}>{s.mean_12wk.toFixed(1)}</td>
                    <td style={{ textAlign: "right" }}>{s.z_score.toFixed(1)}</td>
                  </tr>
                ))}
                {sections.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-muted)" }}>
                      No stable sections.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function Stat({
  label,
  value,
  delta,
  deltaTone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "danger" | "success" | "neutral";
}) {
  return (
    <div className="card-surface panel" style={{ padding: 14, display: "grid", gap: 4 }}>
      <span className="eyebrow" style={{ margin: 0 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {delta ? (
        <span
          style={{
            fontSize: 12,
            color:
              deltaTone === "danger"
                ? "var(--danger)"
                : deltaTone === "success"
                  ? "var(--success)"
                  : "var(--text-muted)",
          }}
        >
          {delta}
        </span>
      ) : null}
    </div>
  );
}

function EvidenceChips({ refs }: { refs: string[] }) {
  if (!refs?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {refs.map((r) => (
        <span
          key={r}
          className="badge badge-neutral"
          style={{ fontSize: 11 }}
          title="Grounded evidence from context"
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function findLinkedDecision(
  rec: Recommendation,
  decisions: PastDecisionWithImpact[],
): PastDecisionWithImpact | null {
  const scope = rec.target_scope ?? {};
  for (const d of decisions) {
    const ds = d.target_scope ?? {};
    if (
      rec.kind === "supplier_switch" &&
      d.kind === "supplier_switch" &&
      scope.part_number &&
      ds.part_number === scope.part_number
    ) {
      return d;
    }
    if (
      (rec.kind === "recalibration" || rec.kind === "process_control") &&
      (d.kind === "recalibration" || d.kind === "process_control") &&
      scope.section_name &&
      ds.section_name === scope.section_name
    ) {
      return d;
    }
  }
  return null;
}

function signalIdFor(c: AnomalyCandidate): string {
  switch (c.kind) {
    case "article_rate":
      return `sig_article_${c.article_id}`;
    case "section_count":
      return `sig_section_${c.section_name.replace(/\s+/g, "_")}`;
    case "batch_cohort":
      return `sig_batch_${c.batch_id}`;
    case "lag_shift":
      return `sig_lag_${c.article_id}`;
    case "operator":
      return `sig_operator_${c.order_id}`;
  }
}

function severityRing(sev: Severity) {
  if (sev === "critical" || sev === "high") return "pf-learning-high";
  if (sev === "medium") return "pf-learning-medium";
  return "pf-learning-low";
}

function badgeTone(sev: Severity) {
  if (sev === "critical" || sev === "high") return "danger";
  if (sev === "medium") return "warning";
  return "neutral";
}

function directionTone(d: DecisionEchoDirection) {
  if (d === "improved") return "success";
  if (d === "worsened") return "danger";
  if (d === "flat") return "neutral";
  return "neutral";
}

function directionLabel(d: DecisionEchoDirection) {
  if (d === "improved") return "improved";
  if (d === "worsened") return "worsened";
  if (d === "flat") return "flat";
  return "insufficient data";
}

function formatKind(k: string) {
  return k.replace(/_/g, " ");
}

function formatUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
