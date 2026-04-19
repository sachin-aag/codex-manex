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

import type { QontrolCase, Severity } from "@/lib/qontrol-data";

type Point = {
  x: number;
  y: number;
  caseId: string;
  title: string;
  articleId: string;
  severity: Severity;
  lastUpdate: string;
};

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "var(--success)",
  medium: "var(--warning)",
  high: "var(--danger)",
};

function TimelineTooltip({
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
        <strong>{p.caseId}</strong>
      </p>
      <p style={{ fontSize: 12 }}>
        {p.articleId} · {p.title}
      </p>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
        {p.severity} · {new Date(p.lastUpdate).toLocaleString()}
      </p>
    </div>
  );
}

type Props = {
  cases: QontrolCase[];
};

export function InboxTimeline({ cases }: Props) {
  const points = useMemo((): Point[] => {
    return cases
      .filter((c) => c.lastUpdateAt)
      .map((c) => {
        const t = new Date(c.lastUpdateAt).getTime();
        return {
          x: t,
          y: 0,
          caseId: c.id,
          title: c.title,
          articleId: c.articleId,
          severity: c.severity,
          lastUpdate: c.lastUpdateAt,
        };
      })
      .sort((a, b) => a.x - b.x);
  }, [cases]);

  /** Draw low → medium → high so higher severity dots paint on top. */
  const bySev = useMemo(() => {
    const sevs: Severity[] = ["low", "medium", "high"];
    return sevs.map((s) => ({
      severity: s,
      color: SEVERITY_COLOR[s],
      points: points.filter((p) => p.severity === s),
    }));
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="chart-empty rd-timeline-empty">
        No cases with dates for the timeline.
      </p>
    );
  }

  return (
    <div className="rd-timeline-mini">
      <div className="recharts-host chart-plot rd-inbox-timeline-chart">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 22 }}>
            <CartesianGrid
              strokeDasharray="4 6"
              stroke="var(--border)"
              strokeOpacity={0.65}
              vertical
              horizontal={false}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              }
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis type="number" dataKey="y" domain={[-0.5, 0.5]} hide tick={false} />
            <Tooltip content={TimelineTooltip} cursor={{ strokeDasharray: "4 4" }} />
            {bySev.map(
              (g) =>
                g.points.length > 0 && (
                  <Scatter
                    key={g.severity}
                    name={g.severity}
                    data={g.points}
                    fill={g.color}
                    fillOpacity={0.92}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                ),
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="rd-timeline-legend" aria-label="Severity">
        {(["low", "medium", "high"] as const).map((s) => (
          <span key={s} className="rd-timeline-legend-item">
            <span
              className="rd-timeline-legend-swatch"
              style={{ background: SEVERITY_COLOR[s] }}
            />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
