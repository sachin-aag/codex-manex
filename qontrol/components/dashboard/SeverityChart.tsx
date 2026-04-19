"use client";

import type { SeverityStackRow, SeverityTotals } from "@/lib/portfolio-data";
import { SEVERITY_COLORS } from "@/lib/chart-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: SeverityStackRow[];
  /** Optional global counts across all defects (for comparison with stacked-by-section view). */
  globalTotals?: SeverityTotals;
};

function formatGlobalTotals(g: SeverityTotals): string {
  const core = g.low + g.medium + g.high + g.critical;
  const o = g.other > 0 ? ` · other ${g.other}` : "";
  return `All defects (${core}): low ${g.low} · medium ${g.medium} · high ${g.high} · critical ${g.critical}${o}`;
}

export function SeverityChart({ data, globalTotals }: Props) {
  const chartData = data.map((r) => ({
    section:
      r.section.length > 22 ? `${r.section.slice(0, 20)}…` : r.section,
    sectionFull: r.section,
    low: r.low,
    medium: r.medium,
    high: r.high,
    critical: r.critical,
    other: r.other,
  }));

  if (!chartData.length) {
    return <p className="chart-empty">No severity breakdown by section.</p>;
  }

  return (
    <div className="recharts-host chart-plot">
      {globalTotals ? (
        <p className="chart-desc" style={{ marginBottom: 10 }}>
          {formatGlobalTotals(globalTotals)}
        </p>
      ) : null}
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="section"
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={70}
          />
          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(label, payload) => {
              const arr = payload as unknown as
                | ReadonlyArray<{ payload?: { sectionFull?: string } }>
                | undefined;
              const full = arr?.[0]?.payload?.sectionFull;
              return full ?? String(label);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="low" stackId="a" name="Low" fill={SEVERITY_COLORS.low} />
          <Bar
            dataKey="medium"
            stackId="a"
            name="Medium"
            fill={SEVERITY_COLORS.medium}
          />
          <Bar dataKey="high" stackId="a" name="High" fill={SEVERITY_COLORS.high} />
          <Bar
            dataKey="critical"
            stackId="a"
            name="Critical"
            fill={SEVERITY_COLORS.critical}
          />
          <Bar dataKey="other" stackId="a" name="Other" fill={SEVERITY_COLORS.other} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
