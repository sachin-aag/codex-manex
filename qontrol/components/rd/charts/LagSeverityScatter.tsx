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

const COLORS = [
  "var(--brand)",
  "var(--danger)",
  "var(--warning)",
  "#5a6f83",
  "#0b706f",
  "#1a8d55",
];

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
      pts.push({
        x: lag,
        y: severityRank(sev),
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
      color: COLORS[i % COLORS.length],
      data: points.filter((p) => p.part === name),
    }));
  }, [parts, points]);

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
        {byPart.map((g) => (
          <span key={g.name} className="claim-lag-legend-chip" title={g.name}>
            <span
              className="claim-lag-legend-swatch"
              style={{ background: g.color }}
            />
            <span className="claim-lag-legend-label">
              {g.name.length > 28 ? `${g.name.slice(0, 26)}…` : g.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
