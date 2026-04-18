"use client";

import { Fragment, useState } from "react";
import type { SectionHeatmapData } from "@/lib/portfolio-data";

type Props = {
  data: SectionHeatmapData;
};

function cellColor(count: number, max: number): string {
  if (max <= 0 || count === 0) return "var(--surface-muted)";
  const t = count / max;
  const alpha = 0.15 + t * 0.75;
  return `color-mix(in srgb, var(--brand) ${Math.round(alpha * 100)}%, var(--surface-subtle))`;
}

export function SectionHeatmap({ data }: Props) {
  const { cells, detectedOrder, occurrenceOrder, maxCount } = data;
  const [tip, setTip] = useState<{
    d: string;
    o: string;
    c: number;
  } | null>(null);

  const lookup = new Map<string, number>();
  for (const c of cells) {
    lookup.set(`${c.detected}\x00${c.occurred}`, c.count);
  }

  if (!detectedOrder.length || !occurrenceOrder.length) {
    return (
      <p className="chart-empty">No section data for defects in range.</p>
    );
  }

  return (
    <div className="heatmap-wrap chart-plot-region">
      <div className="heatmap-legend">
        <span>Low</span>
        <div className="heatmap-gradient" />
        <span>High</span>
      </div>
      <div
        className="heatmap-grid"
        style={{
          gridTemplateColumns: `minmax(120px, 1.2fr) repeat(${occurrenceOrder.length}, minmax(48px, 1fr))`,
        }}
      >
        <div className="heatmap-corner" />
        {occurrenceOrder.map((o) => (
          <div key={o} className="heatmap-col-label" title={o}>
            {o.length > 14 ? `${o.slice(0, 12)}…` : o}
          </div>
        ))}
        {detectedOrder.map((d) => (
          <Fragment key={d}>
            <div className="heatmap-row-label" title={d}>
              {d.length > 18 ? `${d.slice(0, 16)}…` : d}
            </div>
            {occurrenceOrder.map((o) => {
              const count = lookup.get(`${d}\x00${o}`) ?? 0;
              return (
                <div
                  key={`${d}-${o}`}
                  className="heatmap-cell"
                  style={{ background: cellColor(count, maxCount) }}
                  onMouseEnter={() => setTip({ d, o, c: count })}
                  onMouseLeave={() => setTip(null)}
                >
                  {count > 0 ? count : ""}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      {tip ? (
        <p className="heatmap-tooltip">
          <strong>Detected:</strong> {tip.d}
          <br />
          <strong>Occurred:</strong> {tip.o}
          <br />
          <strong>Count:</strong> {tip.c}
        </p>
      ) : null}
    </div>
  );
}
