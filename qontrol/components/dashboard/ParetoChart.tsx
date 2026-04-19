"use client";

import { useMemo } from "react";
import type { ParetoRow } from "@/lib/portfolio-data";
import { CHART_COLORS } from "@/lib/chart-theme";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ParetoChartRow = {
  defect_code: string;
  /** Per-code defect count (bar length). */
  count: number;
  /** Running cumulative % of all defects (line). */
  cumulative: number;
};

type Props = {
  data: ParetoRow[];
};

export function ParetoChart({ data }: Props) {
  const chartData = useMemo((): ParetoChartRow[] => {
    const sorted = [...data].sort((a, b) => b.cnt - a.cnt);
    const totalCount = sorted.reduce((s, r) => s + r.cnt, 0);
    const top = sorted.slice(0, 15);
    let cumSum = 0;
    return top.map((d) => {
      const count = d.cnt;
      cumSum += count;
      return {
        defect_code: d.defect_code,
        count,
        cumulative: totalCount > 0 ? (cumSum / totalCount) * 100 : 0,
      };
    });
  }, [data]);

  const maxCount = useMemo(
    () => Math.max(1, ...chartData.map((r) => r.count)),
    [chartData],
  );

  if (!chartData.length) {
    return <p className="chart-empty">No defect codes to display.</p>;
  }

  return (
    <div className="recharts-host chart-plot">
      <ResponsiveContainer>
        <ComposedChart
          data={chartData}
          layout="vertical"
          margin={{ top: 28, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            xAxisId="count"
            domain={[0, maxCount]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            label={{ value: "Count", position: "insideBottom", offset: -4, fill: "var(--text-muted)", fontSize: 11 }}
          />
          <XAxis
            type="number"
            xAxisId="pct"
            orientation="top"
            domain={[0, 100]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: "Cumulative %", position: "insideTop", offset: -4, fill: "var(--text-muted)", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="defect_code"
            width={110}
            tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const n = Number(value);
              if (name === "cumulative" || name === "Cumulative %") {
                return [`${n.toFixed(1)}%`, "Cumulative"];
              }
              return [n, "Count"];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            xAxisId="count"
            dataKey="count"
            name="Count"
            fill={CHART_COLORS.barPrimary}
            radius={[0, 4, 4, 0]}
          />
          <Line
            xAxisId="pct"
            type="linear"
            dataKey="cumulative"
            name="Cumulative %"
            stroke={CHART_COLORS.cumulativeLine}
            strokeWidth={2.5}
            dot={{
              r: 4,
              fill: CHART_COLORS.pointFill,
              stroke: CHART_COLORS.cumulativeLine,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          <ReferenceLine
            xAxisId="pct"
            x={80}
            stroke={CHART_COLORS.referenceLine}
            strokeDasharray="4 4"
            label={{
              value: "80%",
              position: "top",
              fill: CHART_COLORS.referenceLine,
              fontSize: 11,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
