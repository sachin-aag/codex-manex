"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Rectangle, ResponsiveContainer, Tooltip, Treemap } from "recharts";
import type { TreemapNode } from "recharts";

type RecurringRow = {
  part_number: string;
  count: number;
  articles: string[];
  fcIds: string[];
};

type Props = {
  rows: RecurringRow[];
  maxShown?: number;
  /** Preserved when navigating to part focus (time filter). */
  timeRange?: { from: string; to: string };
};

function intensityFill(count: number, max: number): string {
  if (max <= 0) return "var(--brand-soft)";
  const t = Math.min(count / max, 1);
  const pct = Math.round(35 + t * 55);
  return `color-mix(in srgb, var(--brand) ${pct}%, var(--surface-subtle))`;
}

function TreemapCell({
  node,
  maxVal,
  onPartClick,
}: {
  node: TreemapNode;
  maxVal: number;
  onPartClick: (part: string) => void;
}) {
  const { x, y, width, height, name, value } = node;
  const v = typeof value === "number" ? value : Number(value ?? 0);
  const fill = intensityFill(v, maxVal);
  const showLabel = width > 48 && height > 28;
  const label = String(name ?? "");

  return (
    <g>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="var(--surface)"
        strokeWidth={2}
        rx={4}
        ry={4}
        style={{ cursor: "pointer" }}
        onClick={() => onPartClick(label)}
      />
      {showLabel ? (
        <text
          x={x + width / 2}
          y={y + height / 2 - 4}
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize={width > 90 ? 12 : 10}
          fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {label.length > 14 ? `${label.slice(0, 12)}…` : label}
        </text>
      ) : null}
      {showLabel && height > 36 ? (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize={10}
          style={{ pointerEvents: "none" }}
        >
          {v}
        </text>
      ) : null}
    </g>
  );
}

function TreeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: { name?: string; value?: number; articles?: string };
  }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div
      className="scatter-tooltip card-surface"
      style={{ maxWidth: 280 }}
    >
      <p>
        <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{p.name}</strong>
      </p>
      <p style={{ marginTop: 4 }}>{p.value} claims</p>
      {p.articles ? (
        <p className="scatter-tooltip-excerpt" style={{ marginTop: 6 }}>
          {p.articles}
        </p>
      ) : null}
    </div>
  );
}

export function RecurringPartsTreemap({ rows, maxShown = 12, timeRange }: Props) {
  const router = useRouter();
  const shown = useMemo(() => rows.slice(0, maxShown), [rows, maxShown]);
  const maxVal = useMemo(() => Math.max(1, ...shown.map((r) => r.count)), [shown]);

  const data = useMemo(
    () =>
      shown.map((r) => ({
        name: r.part_number,
        value: r.count,
        articles: r.articles.join(", "),
      })),
    [shown],
  );

  const onPartClick = useCallback(
    (partKey: string) => {
      const p = new URLSearchParams();
      p.set("filter", "recurring_part");
      p.set("part", partKey);
      if (timeRange) {
        p.set("from", timeRange.from);
        p.set("to", timeRange.to);
      }
      router.push(`/rd?${p.toString()}`);
    },
    [router, timeRange],
  );

  const renderContent = useCallback(
    (nodeProps: TreemapNode) => (
      <TreemapCell node={nodeProps} maxVal={maxVal} onPartClick={onPartClick} />
    ),
    [maxVal, onPartClick],
  );

  if (!shown.length) {
    return (
      <p className="chart-empty" style={{ padding: "0 18px 18px" }}>
        No claims to group by part.
      </p>
    );
  }

  return (
    <div className="recharts-host chart-plot rd-treemap-chart">
      <ResponsiveContainer>
        <Treemap
          data={data}
          dataKey="value"
          nameKey="name"
          type="flat"
          content={renderContent}
          isAnimationActive={false}
          stroke="var(--border)"
        >
          <Tooltip content={TreeTooltip} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
