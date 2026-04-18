"use client";

import type { ClaimScatterPoint } from "@/lib/portfolio-data";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: ClaimScatterPoint[];
};

const COLORS = [
  "var(--brand)",
  "var(--danger)",
  "var(--warning)",
  "#5a6f83",
  "#0b706f",
];

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ClaimScatterPoint }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="scatter-tooltip card-surface">
      <p>
        <strong>{p.id}</strong>
      </p>
      <p>{p.article_name}</p>
      <p>
        Build: {new Date(p.x).toLocaleDateString()} · Lag: {p.y} days
      </p>
      <p className="scatter-tooltip-excerpt">{p.complaint_excerpt}</p>
    </div>
  );
}

export function ClaimLagScatter({ data }: Props) {
  const articles = Array.from(new Set(data.map((d) => d.article_name)));
  const byArticle = articles.map((name, i) => ({
    name,
    color: COLORS[i % COLORS.length],
    points: data.filter((d) => d.article_name === name),
  }));

  if (!data.length) {
    return (
      <p className="chart-empty">
        No field claims with build date and lag. Ensure{" "}
        <code className="kpi-code">product_build_ts</code> is available in the API.
      </p>
    );
  }

  return (
    <div className="claim-lag-scatter-stack">
      <div className="recharts-host chart-plot claim-lag-chart-plot">
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
              domain={["auto", "auto"]}
              name="Build"
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                })
              }
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Days from build"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={{ stroke: "var(--border)" }}
              axisLine={{ stroke: "var(--border)" }}
              label={{
                value: "Days to claim",
                angle: -90,
                position: "insideLeft",
                offset: 4,
                fill: "var(--text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <Tooltip content={ScatterTooltip} cursor={{ strokeDasharray: "4 4" }} />
            {byArticle.map((g) => (
              <Scatter
                key={g.name}
                name={g.name}
                data={g.points}
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
      <div className="claim-lag-legend" aria-label="Series by article">
        {byArticle.map((g) => (
          <span key={g.name} className="claim-lag-legend-chip" title={g.name}>
            <span
              className="claim-lag-legend-swatch"
              style={{ background: g.color }}
            />
            <span className="claim-lag-legend-label">
              {g.name.length > 40 ? `${g.name.slice(0, 38)}…` : g.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
