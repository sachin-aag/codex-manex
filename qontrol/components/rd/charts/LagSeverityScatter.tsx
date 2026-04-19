"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_SERIES } from "@/lib/chart-theme";
import type { ClaimLagRow } from "@/lib/db/rd";
import type { QontrolCase, Severity } from "@/lib/qontrol-data";

type Point = {
  x: number;
  y: number;
  yLabel: string;
  fieldClaimId: string;
  part: string;
  articleName: string;
  severity: Severity;
};

const LEGEND_MAX = 8;

/** Deterministic jitter in [-0.15, 0.15] so dots at same lag/severity spread slightly. */
function yJitter(seed: string, baseY: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const u = (h % 1001) / 1000;
  const j = (u - 0.5) * 0.3;
  return Math.min(3.45, Math.max(0.55, baseY + j));
}

function severityRank(s: Severity): number {
  switch (s) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    default:
      return 2;
  }
}

function severityLabel(s: Severity): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ScatterTooltipBody({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Point }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="scatter-tooltip card-surface">
      <p>
        <strong>{p.fieldClaimId}</strong>
      </p>
      <p style={{ fontSize: 12 }}>{p.part}</p>
      <p style={{ fontSize: 12 }}>{p.articleName}</p>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
        Severity: {p.severity} · Lag: {Math.round(p.x)} d
      </p>
    </div>
  );
}

type Props = {
  claims: ClaimLagRow[];
  cases: QontrolCase[];
};

export function LagSeverityScatter({ claims, cases }: Props) {
  const sevByCaseId = useMemo(() => {
    const m = new Map<string, Severity>();
    for (const c of cases) {
      m.set(c.id, c.severity);
    }
    return m;
  }, [cases]);

  const { points, parts } = useMemo(() => {
    const pts: Point[] = [];
    for (const cl of claims) {
      const lag = cl.days_from_build;
      if (lag == null || !Number.isFinite(lag)) continue;
      const sev = sevByCaseId.get(cl.field_claim_id) ?? ("medium" as Severity);
      const pn = cl.reported_part_number ?? "unknown";
      const baseY = severityRank(sev);
      pts.push({
        x: lag,
        y: yJitter(cl.field_claim_id, baseY),
        yLabel: severityLabel(sev),
        fieldClaimId: cl.field_claim_id,
        part: pn,
        articleName: cl.article_name ?? cl.article_id,
        severity: sev,
      });
    }
    const partList = Array.from(new Set(pts.map((p) => p.part)));
    return { points: pts, parts: partList };
  }, [claims, sevByCaseId]);

  const byPart = useMemo(() => {
    return parts.map((name, i) => ({
      name,
      color: CHART_SERIES[i % CHART_SERIES.length],
      data: points.filter((p) => p.part === name),
    }));
  }, [parts, points]);

  const legendParts = parts.slice(0, LEGEND_MAX);
  const legendOverflow = Math.max(0, parts.length - LEGEND_MAX);

  if (points.length === 0) {
    return (
      <p className="chart-empty" style={{ padding: "0 18px 18px" }}>
        No field claims with lag and matching case severity. Open FC cases need to align with claim
        IDs.
      </p>
    );
  }

  return (
    <div className="claim-lag-scatter-stack">
      <div className="recharts-host chart-plot claim-lag-chart-plot rd-lag-severity-chart">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 8, left: 4, bottom: 10 }}>
            <CartesianGrid
              strokeDasharray="4 6"
              stroke="var(--border)"
              strokeOpacity={0.65}
              vertical
              horizontal
            />
            <XAxis
              type="number"
              dataKey="x"
              name="Lag"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
              label={{
                value: "Days from build",
                position: "insideBottom",
                offset: -2,
                fill: "var(--text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={(v) => (v === 1 ? "Low" : v === 2 ? "Medium" : "High")}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
              label={{
                value: "Severity",
                angle: -90,
                position: "insideLeft",
                offset: 4,
                fill: "var(--text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <Tooltip content={ScatterTooltipBody} cursor={{ strokeDasharray: "4 4" }} />
            {byPart.map((g) => (
              <Scatter
                key={g.name}
                name={g.name}
                data={g.data}
                fill={g.color}
                fillOpacity={0.88}
                stroke="var(--surface)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="claim-lag-legend" aria-label="Series by part">
        {legendParts.map((name) => {
          const g = byPart.find((x) => x.name === name)!;
          return (
            <span key={name} className="claim-lag-legend-chip" title={name}>
              <span
                className="claim-lag-legend-swatch"
                style={{ background: g.color }}
              />
              <span className="claim-lag-legend-label">
                {name.length > 28 ? `${name.slice(0, 26)}…` : name}
              </span>
            </span>
          );
        })}
        {legendOverflow > 0 ? (
          <span className="claim-lag-legend-overflow" title={`${legendOverflow} more part(s) not shown`}>
            +{legendOverflow} more
          </span>
        ) : null}
      </div>
    </div>
  );
}
