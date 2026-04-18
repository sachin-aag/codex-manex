"use client";

import { useMemo } from "react";
import type { WeeklyTrendPoint } from "@/lib/portfolio-data";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: WeeklyTrendPoint[];
};

export function DefectTrendChart({ data }: Props) {
  const { maxLeft, maxRight } = useMemo(() => {
    let ml = 1;
    let mr = 1;
    for (const d of data) {
      ml = Math.max(ml, d.defect_count ?? 0, d.claim_count ?? 0);
      mr = Math.max(mr, d.products_built ?? 0);
    }
    return { maxLeft: ml, maxRight: mr };
  }, [data]);

  if (!data.length) {
    return (
      <p className="chart-empty">No weekly summary data for this range.</p>
    );
  }

  return (
    <div className="recharts-host chart-plot">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 28, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            yAxisId="left"
            domain={[0, maxLeft]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--border)" }}
            label={{
              value: "Defects & claims (count)",
              angle: -90,
              position: "insideLeft",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, maxRight]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--border)" }}
            label={{
              value: "Products built",
              angle: 90,
              position: "insideRight",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--text-primary)" }}
            formatter={(value, name) => {
              const n = String(name);
              if (n.includes("claim intake")) {
                return [value, `${n} — not product build week`];
              }
              return [value, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="right"
            dataKey="products_built"
            name="Products built"
            fill="var(--surface-muted)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="defect_count"
            name="Defects"
            stroke="var(--danger)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="claim_count"
            name="Field claims (claim intake week)"
            stroke="var(--warning)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
