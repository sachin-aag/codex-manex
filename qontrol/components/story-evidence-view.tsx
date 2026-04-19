"use client";

import type { QontrolCase, StoryMatrixCell } from "@/lib/qontrol-data";

import { StoryEvidenceGraph } from "@/components/story-evidence-graph";

type Props = {
  visualization: QontrolCase["visualization"];
  evidenceTrail: string[];
};

type SignalTrendRow = {
  label: string;
  defectCount: number;
  failCount: number;
  marginalCount: number;
  highlight?: boolean;
};

function formatShare(value: number) {
  return `${Math.round(value * 100)}%`;
}

function shortEvidence(item: string) {
  const trimmed = item.trim();
  return trimmed.length > 92 ? `${trimmed.slice(0, 90)}...` : trimmed;
}

function outcomeCount(
  points: Array<{ label: string; count: number }>,
  label: string,
) {
  return points.find((point) => point.label === label)?.count ?? 0;
}

function DistributionBars({
  points,
  emptyLabel,
}: {
  points: Array<{ label: string; count: number; highlight?: boolean; detail?: string }>;
  emptyLabel: string;
}) {
  const maxCount = Math.max(1, ...points.map((point) => point.count));

  if (!points.length) {
    return <p className="chart-empty">{emptyLabel}</p>;
  }

  return (
    <div className="story-distribution-list">
      {points.map((point) => (
        <div
          className={`story-distribution-row ${point.highlight ? "highlight" : ""}`}
          key={`${point.label}-${point.count}`}
        >
          <div className="story-distribution-copy">
            <span>{point.label}</span>
            {point.detail ? <small>{point.detail}</small> : null}
          </div>
          <div className="story-distribution-track">
            <div
              className={`story-distribution-fill ${point.highlight ? "highlight" : ""}`}
              style={{ width: `${(point.count / maxCount) * 100}%` }}
            />
          </div>
          <strong>{point.count}</strong>
        </div>
      ))}
    </div>
  );
}

function SignalTimeline({ data }: { data: SignalTrendRow[] }) {
  if (!data.length) {
    return <p className="chart-empty">No weekly drift signal yet.</p>;
  }

  return (
    <div className="story-timeline-grid">
      {data.map((point) => (
        <article
          className={`story-timeline-card ${point.highlight ? "highlight" : ""}`}
          key={`${point.label}-${point.defectCount}-${point.failCount}-${point.marginalCount}`}
        >
          <span>{point.label}</span>
          <strong>{point.defectCount} defect(s)</strong>
          <p>
            {point.failCount} fail / {point.marginalCount} marginal
          </p>
        </article>
      ))}
    </div>
  );
}

function matrixCellColor(count: number, maxCount: number) {
  if (count <= 0 || maxCount <= 0) return "var(--surface-subtle)";
  const alpha = 0.16 + (count / maxCount) * 0.7;
  return `color-mix(in srgb, var(--brand) ${Math.round(alpha * 100)}%, var(--surface-subtle))`;
}

function HandlingMatrix({
  orders,
  operators,
  cells,
  maxCount,
}: {
  orders: string[];
  operators: string[];
  cells: StoryMatrixCell[];
  maxCount: number;
}) {
  if (!orders.length || !operators.length) {
    return <p className="chart-empty">No operator-order evidence yet.</p>;
  }

  const lookup = new Map(cells.map((cell) => [`${cell.order}\x00${cell.operator}`, cell]));

  return (
    <div className="story-matrix-wrap chart-plot-region">
      <div
        className="story-matrix-grid"
        style={{
          gridTemplateColumns: `minmax(132px, 1.2fr) repeat(${operators.length}, minmax(72px, 1fr))`,
        }}
      >
        <div className="story-matrix-corner" />
        {operators.map((operator) => (
          <div className="story-matrix-col-label" key={operator} title={operator}>
            {operator}
          </div>
        ))}
        {orders.map((order) => (
          <div key={order} className="story-matrix-row">
            <div className="story-matrix-row-label">{order}</div>
            {operators.map((operator) => {
              const cell = lookup.get(`${order}\x00${operator}`);
              return (
                <div
                  key={`${order}-${operator}`}
                  className={`story-matrix-cell ${cell?.highlight ? "highlight" : ""}`}
                  style={{ background: matrixCellColor(cell?.count ?? 0, maxCount) }}
                  title={
                    cell
                      ? `${order} · ${operator}: ${cell.count} rework link(s)${
                          cell.defectTypes.length ? ` · ${cell.defectTypes.join(", ")}` : ""
                        }`
                      : `${order} · ${operator}: 0 links`
                  }
                >
                  {cell?.count ? cell.count : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryFacts({
  evidenceTrail,
  annotations,
}: {
  evidenceTrail: string[];
  annotations: string[];
}) {
  return (
    <div className="story-fact-block">
      <h4>Supporting facts</h4>
      <div className="story-fact-grid">
        {evidenceTrail.map((item) => (
          <div className="story-fact-chip" key={item}>
            {shortEvidence(item)}
          </div>
        ))}
      </div>
      <ul className="bullet-list compact">
        {annotations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function StoryEvidenceView({ visualization, evidenceTrail }: Props) {
  if (visualization.kind === "supplier") {
    const graphKey = `${visualization.kind}:${visualization.batchId}:${visualization.supplierName}`;
    return (
      <div className="story-evidence-layout">
        <p className="story-visual-summary">{visualization.summary}</p>
        <StoryEvidenceGraph key={graphKey} visualization={visualization} />
        <div className="story-kpi-grid">
          <div className="story-kpi-card">
            <span>Supplier</span>
            <strong>{visualization.supplierName}</strong>
            <p>Batch {visualization.batchId}</p>
          </div>
          <div className="story-kpi-card">
            <span>Cohort hit rate</span>
            <strong>{formatShare(visualization.defectRate)}</strong>
            <p>
              {visualization.affectedProducts} of {visualization.exposedProducts} exposed products
            </p>
          </div>
        </div>
        <div className="story-support-grid two-up">
          <section className="story-support-panel">
            <h4>Field-claim lag</h4>
            <DistributionBars
              points={visualization.lagDistribution}
              emptyLabel="No claim lag evidence yet."
            />
          </section>
          <section className="story-support-panel">
            <h4>ESR test outcomes</h4>
            <DistributionBars
              points={visualization.testOutcomes}
              emptyLabel="No ESR test outcomes for this batch."
            />
          </section>
        </div>
        <StoryFacts evidenceTrail={evidenceTrail} annotations={visualization.annotations} />
      </div>
    );
  }

  if (visualization.kind === "process") {
    const peakPoint = [...visualization.trend].sort(
      (a, b) =>
        b.defectCount + b.failCount + b.marginalCount - (a.defectCount + a.failCount + a.marginalCount),
    )[0];
    const graphKey = `${visualization.kind}:${visualization.section}:${visualization.filteredFalsePositives}:${visualization.trend.map((point) => `${point.label}-${point.defectCount}-${point.failCount}-${point.marginalCount}`).join("|")}`;
    return (
      <div className="story-evidence-layout">
        <p className="story-visual-summary">
          {visualization.summary} Focus section: <strong>{visualization.section}</strong>.
        </p>
        <StoryEvidenceGraph key={graphKey} visualization={visualization} />
        <div className="story-kpi-grid">
          <div className="story-kpi-card">
            <span>Focus section</span>
            <strong>{visualization.section}</strong>
            <p>Most likely occurrence section for the bounded process spike</p>
          </div>
          <div className="story-kpi-card">
            <span>Peak window</span>
            <strong>{peakPoint?.label ?? "Unknown"}</strong>
            <p>
              {peakPoint?.defectCount ?? 0} defects, {peakPoint?.failCount ?? 0} fail,{" "}
              {peakPoint?.marginalCount ?? 0} marginal
            </p>
          </div>
          <div className="story-kpi-card">
            <span>Filtered false positives</span>
            <strong>{visualization.filteredFalsePositives}</strong>
            <p>Inspection noise removed before pattern scoring</p>
          </div>
        </div>
        <div className="story-support-grid">
          <section className="story-support-panel">
            <h4>Signal window</h4>
            <SignalTimeline data={visualization.trend} />
          </section>
        </div>
        <StoryFacts evidenceTrail={evidenceTrail} annotations={visualization.annotations} />
      </div>
    );
  }

  if (visualization.kind === "design") {
    const dominantLag = [...visualization.lagDistribution].sort((a, b) => b.count - a.count)[0];
    const totalClaims = visualization.claimScatter.length;
    const graphKey = `${visualization.kind}:${visualization.findNumber}:${visualization.fieldOnlyClaims}:${visualization.overlappingClaims}:${visualization.claimScatter.length}`;

    return (
      <div className="story-evidence-layout">
        <p className="story-visual-summary">{visualization.summary}</p>
        <StoryEvidenceGraph key={graphKey} visualization={visualization} />
        <div className="story-kpi-grid">
          <div className="story-kpi-card">
            <span>BOM position</span>
            <strong>{visualization.findNumber}</strong>
            <p>{visualization.assembly}</p>
          </div>
          <div className="story-kpi-card">
            <span>Field-only signal</span>
            <strong>{visualization.fieldOnlyClaims}</strong>
            <p>
              {visualization.fieldOnlyClaims} of {totalClaims} claim(s) lack a linked factory defect
            </p>
          </div>
        </div>
        <div className="story-support-grid two-up">
          <section className="story-support-panel">
            <h4>Lag buckets</h4>
            <DistributionBars
              points={visualization.lagDistribution}
              emptyLabel="No lag evidence yet."
            />
          </section>
          <section className="story-support-panel">
            <h4>Evidence balance</h4>
            <DistributionBars
              points={[
                {
                  label: "Field-only",
                  count: visualization.fieldOnlyClaims,
                  detail: "Claims with no linked factory defect",
                  highlight: true,
                },
                {
                  label: "Overlap",
                  count: visualization.overlappingClaims,
                  detail: "Claims that still overlap factory evidence",
                },
              ]}
              emptyLabel="No design evidence balance available."
            />
            <p className="story-support-note">
              Dominant lag bucket: <strong>{dominantLag?.label ?? "Not enough evidence yet"}</strong>.
            </p>
          </section>
        </div>
        <StoryFacts evidenceTrail={evidenceTrail} annotations={visualization.annotations} />
      </div>
    );
  }

  const graphKey = `${visualization.kind}:${visualization.operator}:${visualization.orderMatrix.orders.join("|")}:${visualization.actionSnapshot.openActions}:${visualization.actionSnapshot.closedActions}`;
  return (
    <div className="story-evidence-layout">
      <p className="story-visual-summary">
        {visualization.summary} Dominant operator: <strong>{visualization.operator}</strong>.
      </p>
      <StoryEvidenceGraph key={graphKey} visualization={visualization} />
      <div className="story-support-grid handling-layout">
        <section className="story-support-panel">
          <h4>Order by operator matrix</h4>
          <HandlingMatrix
            orders={visualization.orderMatrix.orders}
            operators={visualization.orderMatrix.operators}
            cells={visualization.orderMatrix.cells}
            maxCount={visualization.orderMatrix.maxCount}
          />
        </section>
        <section className="story-support-panel">
          <h4>Severity mix</h4>
          <DistributionBars
            points={visualization.severityMix}
            emptyLabel="No severity mix available."
          />
          <div className="story-action-card">
            <span>Follow-up actions</span>
            <strong>
              {visualization.actionSnapshot.closedActions} closed / {visualization.actionSnapshot.openActions} open
            </strong>
            <p>{visualization.actionSnapshot.latestAction}</p>
          </div>
        </section>
      </div>
      <StoryFacts evidenceTrail={evidenceTrail} annotations={visualization.annotations} />
    </div>
  );
}
