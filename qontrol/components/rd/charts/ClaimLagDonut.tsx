"use client";

import { useMemo } from "react";
import { DONUT_BUCKET_COLORS } from "@/lib/chart-theme";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type BucketRow = { bucket: string; count: number; fcIds: string[] };

type Props = {
  buckets: BucketRow[];
  total: number;
};

export function ClaimLagDonut({ buckets, total }: Props) {
  const data = useMemo(
    () =>
      buckets.map((b, i) => ({
        name: b.bucket,
        value: b.count,
        color: DONUT_BUCKET_COLORS[i % DONUT_BUCKET_COLORS.length],
      })),
    [buckets],
  );

  if (total === 0) {
    return (
      <p className="chart-empty" style={{ padding: "0 18px 18px" }}>
        No claims with lag data.
      </p>
    );
  }

  return (
    <div className="rd-donut-wrap">
      <div className="recharts-host chart-plot rd-donut-chart">
        <ResponsiveContainer>
          <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 36 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="46%"
              innerRadius="56%"
              outerRadius="78%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, _name, item) => {
                const v = Number(value ?? 0);
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
                const label =
                  item && typeof item === "object" && "payload" in item
                    ? (item as { payload?: { name?: string } }).payload?.name
                    : undefined;
                return [`${v} (${pct}%)`, label ?? "Bucket"];
              }}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              formatter={(value) => (
                <span style={{ color: "var(--text-secondary)" }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="rd-donut-center-label" aria-hidden>
        <span className="rd-donut-center-kicker">Claims with lag</span>
        <span className="rd-donut-center-value">{total}</span>
      </div>
    </div>
  );
}
