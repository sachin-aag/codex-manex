"use client";

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
};

/** Distinct hues per part; rectangle size still encodes claim count. */
const PART_FILL_PALETTE = [
  "#0d9488",
  "#6366f1",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#059669",
  "#ea580c",
  "#2563eb",
  "#db2777",
  "#65a30d",
  "#0891b2",
  "#b45309",
] as const;

function fillForPartIndex(i: number): string {
  return PART_FILL_PALETTE[i % PART_FILL_PALETTE.length];
}

/** WCAG relative luminance for #rrggbb — choose light vs dark label ink. */
function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  if (n.length !== 6) return 0.5;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const lin = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function useLightInkForHex(hex: string): boolean {
  return relativeLuminance(hex) < 0.42;
}

const INK_DARK = "#0c1419";
const INK_DARK_MUTED = "#1a2832";
const INK_LIGHT = "#ffffff";
const INK_LIGHT_MUTED = "rgba(255,255,255,0.9)";

function TreemapCell({
  node,
  colorByName,
}: {
  node: TreemapNode;
  colorByName: Map<string, string>;
}) {
  const { x, y, width, height, name, value } = node;
  const v = typeof value === "number" ? value : Number(value ?? 0);
  const label = String(name ?? "");
  const fill = colorByName.get(label) ?? fillForPartIndex(0);
  const lightInk = useLightInkForHex(fill);
  const primaryFill = lightInk ? INK_LIGHT : INK_DARK;
  const secondaryFill = lightInk ? INK_LIGHT_MUTED : INK_DARK_MUTED;
  const showPartLabel = width > 36 && height > 20;
  const showCount = showPartLabel && height > 32;
  const titleAttr = `${label}: ${v} claim(s)`;

  return (
    <g>
      <title>{titleAttr}</title>
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
        style={{ cursor: "default" }}
      />
      {showPartLabel ? (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showCount ? 4 : 0)}
          textAnchor="middle"
          fill={primaryFill}
          fontSize={width > 90 ? 12 : 10}
          fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {label.length > 14 ? `${label.slice(0, 12)}…` : label}
        </text>
      ) : null}
      {showCount ? (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fill={secondaryFill}
          fontSize={10}
          fontWeight={600}
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

export function RecurringPartsTreemap({ rows, maxShown = 12 }: Props) {
  const shown = useMemo(() => rows.slice(0, maxShown), [rows, maxShown]);

  const colorByName = useMemo(() => {
    const m = new Map<string, string>();
    shown.forEach((r, i) => {
      m.set(r.part_number, fillForPartIndex(i));
    });
    return m;
  }, [shown]);

  const data = useMemo(
    () =>
      shown.map((r) => ({
        name: r.part_number,
        value: r.count,
        articles: r.articles.join(", "),
      })),
    [shown],
  );

  const renderContent = useCallback(
    (nodeProps: TreemapNode) => (
      <TreemapCell node={nodeProps} colorByName={colorByName} />
    ),
    [colorByName],
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
