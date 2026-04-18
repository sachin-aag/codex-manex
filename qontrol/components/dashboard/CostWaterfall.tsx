"use client";

import type { CostBreakdownData } from "@/lib/portfolio-data";
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
  data: CostBreakdownData;
};

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CostWaterfall({ data }: Props) {
  const { buckets, byDefectCode } = data;
  const topCodes = byDefectCode.slice(0, 12);

  if (!buckets.some((b) => b.amount > 0) && !topCodes.length) {
    return <p className="chart-empty">No cost data available.</p>;
  }

  return (
    <div className="cost-waterfall-stack">
      <div className="cost-waterfall-block">
        <h4 className="chart-subtitle">COPQ buckets</h4>
        <div className="recharts-host chart-plot">
          <ResponsiveContainer>
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="category"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickFormatter={(v) => fmt(v)}
              />
              <Tooltip
                formatter={(v) => [fmt(Number(v ?? 0)), "Amount"]}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="amount" name="Cost" fill="var(--brand)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {topCodes.length > 0 ? (
        <div className="cost-waterfall-block">
          <h4 className="chart-subtitle">Internal defect cost by code</h4>
          <div className="recharts-host chart-plot">
            <ResponsiveContainer>
              <BarChart
                data={topCodes}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                <YAxis
                  type="category"
                  dataKey="defect_code"
                  width={100}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v) => [fmt(Number(v ?? 0)), "Cost"]}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend />
                <Bar dataKey="amount" name="Cost" fill="var(--danger)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
