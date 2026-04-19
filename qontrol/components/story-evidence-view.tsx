"use client";

import type { QontrolCase, StoryMatrixCell } from "@/lib/qontrol-data";
import { ClaimLagScatter } from "@/components/dashboard/ClaimLagScatter";
import { SectionHeatmap } from "@/components/dashboard/SectionHeatmap";
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

type DiagramNodeTone = "accent" | "neutral" | "warning" | "danger" | "success";

type DiagramNode = {
  id: string;
  title: string;
  value: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  tone?: DiagramNodeTone;
};

type DiagramLink = {
  from: string;
  to: string;
  label?: string;
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

function FlowDiagramText({
  x,
  y,
  width,
  title,
  value,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  value: string;
}) {
  const titleLines = title.split("\n");
  const valueLines = value.split("\n");

  return (
    <>
      {titleLines.map((line, index) => (
        <text
          key={`title-${line}-${index}`}
          x={x + width / 2}
          y={y + 22 + index * 14}
          textAnchor="middle"
          className="story-diagram-title"
        >
          {line}
        </text>
      ))}
      {valueLines.map((line, index) => (
        <text
          key={`value-${line}-${index}`}
          x={x + width / 2}
          y={y + 48 + titleLines.length * 10 + index * 18}
          textAnchor="middle"
          className="story-diagram-value"
        >
          {line}
        </text>
      ))}
    </>
  );
}

function FlowDiagram({
  nodes,
  links,
  height = 320,
}: {
  nodes: DiagramNode[];
  links: DiagramLink[];
  height?: number;
}) {
  const width = 1120;
  const positions = new Map(
    nodes.map((node) => [
      node.id,
      {
        x: node.x,
        y: node.y,
        width: node.width ?? 176,
        height: node.height ?? 78,
      },
    ]),
  );

  return (
    <div className="story-diagram-shell">
      <svg
        className="story-diagram"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Causal evidence trail"
      >
        <defs>
          <marker
            id="storyArrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--brand-strong)" />
          </marker>
        </defs>
        {links.map((link) => {
          const from = positions.get(link.from);
          const to = positions.get(link.to);
          if (!from || !to) return null;
          const startX = from.x + from.width;
          const startY = from.y + from.height / 2;
          const endX = to.x;
          const endY = to.y + to.height / 2;
          const controlOffset = Math.max(52, (endX - startX) * 0.45);
          const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
          const labelX = (startX + endX) / 2;
          const labelY = (startY + endY) / 2 - 10;

          return (
            <g key={`${link.from}-${link.to}-${link.label ?? ""}`}>
              <path d={path} className="story-diagram-link" markerEnd="url(#storyArrow)" />
              {link.label ? (
                <text x={labelX} y={labelY} textAnchor="middle" className="story-diagram-link-label">
                  {link.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {nodes.map((node) => {
          const width = node.width ?? 176;
          const height = node.height ?? 78;
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={width}
                height={height}
                rx="20"
                ry="20"
                className={`story-diagram-node ${node.tone ?? "neutral"}`}
              />
              <FlowDiagramText
                x={node.x}
                y={node.y}
                width={width}
                title={node.title}
                value={node.value}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
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

function SignalTrendChart({ data }: { data: SignalTrendRow[] }) {
  if (!data.length) {
    return <p className="chart-empty">No weekly drift signal yet.</p>;
  }

  return (
    <div className="recharts-host chart-plot story-trend-chart">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--border)" }}
            allowDecimals={false}
            label={{
              value: "Signal count",
              angle: -90,
              position: "insideLeft",
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
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="defectCount"
            name="VIB_FAIL defects"
            fill="var(--brand)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="marginalCount"
            name="VIB_TEST marginal"
            stroke="var(--warning)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="failCount"
            name="VIB_TEST fail"
            stroke="var(--danger)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
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

export function StoryEvidenceView({ visualization, evidenceTrail }: Props) {
  if (visualization.kind === "supplier") {
    const diagramNodes: DiagramNode[] = [
      {
        id: "batch",
        title: "Supplier batch",
        value: `${visualization.batchId}\n${visualization.supplierName}`,
        x: 24,
        y: 36,
        tone: "accent",
      },
      {
        id: "exposure",
        title: "Exposure",
        value: `${visualization.exposedProducts} products\nreceived in cohort`,
        x: 24,
        y: 132,
      },
      {
        id: "tests",
        title: "ESR signal",
        value: `${outcomeCount(visualization.testOutcomes, "MARGINAL")} marginal / ${outcomeCount(visualization.testOutcomes, "FAIL")} fail`,
        x: 24,
        y: 228,
        tone: "warning",
      },
      {
        id: "cause",
        title: "Pattern",
        value: `Incoming material issue\n${visualization.batchId}`,
        x: 340,
        y: 126,
        width: 208,
        height: 92,
        tone: "danger",
      },
      {
        id: "defects",
        title: "Factory signal",
        value: `${visualization.steps.find((step) => step.label === "In-factory defects")?.value ?? "0"} SOLDER_COLD\ndefect events`,
        x: 690,
        y: 84,
        tone: "accent",
      },
      {
        id: "claims",
        title: "Field impact",
        value: `${visualization.steps.find((step) => step.label === "Field claims")?.value ?? "0"} claims\n4-8 week lag cluster`,
        x: 916,
        y: 168,
        tone: "warning",
      },
    ];
    const diagramLinks: DiagramLink[] = [
      { from: "batch", to: "cause", label: "traceable" },
      { from: "exposure", to: "cause", label: "installed into" },
      { from: "tests", to: "cause", label: "supports" },
      { from: "cause", to: "defects", label: "drives" },
      { from: "defects", to: "claims", label: "escapes to field" },
    ];

    return (
      <div className="story-evidence-layout">
        <p className="story-visual-summary">{visualization.summary}</p>
        <FlowDiagram nodes={diagramNodes} links={diagramLinks} />
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
            {visualization.annotations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (visualization.kind === "process") {
    const peakPoint = [...visualization.trend].sort(
      (a, b) =>
        b.defectCount + b.failCount + b.marginalCount - (a.defectCount + a.failCount + a.marginalCount),
    )[0];
    const diagramNodes: DiagramNode[] = [
      {
        id: "section",
        title: "Occurrence section",
        value: visualization.section,
        x: 24,
        y: 40,
        tone: "accent",
      },
      {
        id: "testSignal",
        title: "VIB_TEST signal",
        value: `${peakPoint?.marginalCount ?? 0} marginal / ${peakPoint?.failCount ?? 0} fail`,
        x: 24,
        y: 136,
        tone: "warning",
      },
      {
        id: "noise",
        title: "Noise filter",
        value: `${visualization.filteredFalsePositives} false-positive\ninspection events removed`,
        x: 24,
        y: 232,
      },
      {
        id: "cause",
        title: "Pattern",
        value: "Calibration drift\nat assembly step",
        x: 348,
        y: 126,
        width: 216,
        height: 92,
        tone: "danger",
      },
      {
        id: "spike",
        title: "Spike",
        value: `${peakPoint?.defectCount ?? 0} VIB_FAIL\nin peak week`,
        x: 706,
        y: 84,
        tone: "accent",
      },
      {
        id: "detection",
        title: "Detection gate",
        value: "Caught late at\nPruefung Linie 2",
        x: 920,
        y: 168,
      },
    ];
    const diagramLinks: DiagramLink[] = [
      { from: "section", to: "cause", label: "originates in" },
      { from: "testSignal", to: "cause", label: "warns of" },
      { from: "noise", to: "cause", label: "clarifies" },
      { from: "cause", to: "spike", label: "creates" },
      { from: "spike", to: "detection", label: "caught at" },
    ];

    return (
      <div className="story-evidence-layout">
        <p className="story-visual-summary">
          {visualization.summary} Focus section: <strong>{visualization.section}</strong>.
        </p>
        <FlowDiagram nodes={diagramNodes} links={diagramLinks} />
        <div className="story-support-grid process-layout">
          <section className="story-support-panel">
            <h4>Defect and test signal by week</h4>
            <SignalTrendChart data={visualization.trend} />
          </section>
          <section className="story-support-panel">
            <h4>Detected vs. occurred</h4>
            <SectionHeatmap data={visualization.heatmap} />
          </section>
        </div>
        <div className="story-kpi-grid">
          <div className="story-kpi-card">
            <span>Filtered false positives</span>
            <strong>{visualization.filteredFalsePositives}</strong>
            <p>Inspection noise removed from the signature</p>
          </div>
        </div>
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
            {visualization.annotations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (visualization.kind === "design") {
    const dominantLag = [...visualization.lagDistribution].sort((a, b) => b.count - a.count)[0];
    const scatterData = visualization.claimScatter.map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      article_name: point.articleName,
      market: point.market,
      cost: point.cost,
      claim_ts: point.claimTs,
      complaint_excerpt: point.complaintExcerpt,
    }));
    const diagramNodes: DiagramNode[] = [
      {
        id: "article",
        title: "Article",
        value: `${scatterData.length} claim(s)\non this platform`,
        x: 24,
        y: 40,
        tone: "accent",
      },
      {
        id: "bom",
        title: "BOM hotspot",
        value: `${visualization.assembly}\n${visualization.findNumber}`,
        x: 24,
        y: 136,
      },
      {
        id: "fieldOnly",
        title: "Negative evidence",
        value: `${visualization.fieldOnlyClaims} field-only claim(s)\nwithout factory defects`,
        x: 24,
        y: 232,
        tone: "warning",
      },
      {
        id: "cause",
        title: "Pattern",
        value: "Latent design weakness\nthermal drift over time",
        x: 344,
        y: 126,
        width: 220,
        height: 92,
        tone: "danger",
      },
      {
        id: "lag",
        title: "Failure window",
        value: `${dominantLag?.label ?? "8-12 wk"}\ncustomer-use delay`,
        x: 712,
        y: 84,
        tone: "warning",
      },
      {
        id: "claims",
        title: "Field impact",
        value: `${scatterData.length} reported claim(s)\nvisible only in field`,
        x: 928,
        y: 168,
        tone: "accent",
      },
    ];
    const diagramLinks: DiagramLink[] = [
      { from: "article", to: "cause", label: "appears on" },
      { from: "bom", to: "cause", label: "centered at" },
      { from: "fieldOnly", to: "cause", label: "implies" },
      { from: "cause", to: "lag", label: "emerges as" },
      { from: "lag", to: "claims", label: "surfaces in" },
    ];

    return (
      <div className="story-evidence-layout">
        <p className="story-visual-summary">{visualization.summary}</p>
        <FlowDiagram nodes={diagramNodes} links={diagramLinks} />
        <div className="story-kpi-grid">
          <div className="story-kpi-card">
            <span>BOM position</span>
            <strong>{visualization.findNumber}</strong>
            <p>{visualization.assembly}</p>
          </div>
          <div className="story-kpi-card">
            <span>Field-only signal</span>
            <strong>{visualization.fieldOnlyClaims}</strong>
            <p>{visualization.overlappingClaims} claim(s) overlap factory defects</p>
          </div>
        </div>
        <div className="story-support-grid design-layout">
          <section className="story-support-panel story-support-panel-accent">
            <h4>Build date vs. claim lag</h4>
            <ClaimLagScatter data={scatterData} />
          </section>
          <section className="story-support-panel">
            <h4>Lag buckets</h4>
            <DistributionBars
              points={visualization.lagDistribution}
              emptyLabel="No lag evidence yet."
            />
          </section>
        </div>
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
            {visualization.annotations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const topMatrixCell = [...visualization.orderMatrix.cells].sort((a, b) => b.count - a.count)[0];
  const dominantSeverity =
    [...visualization.severityMix].sort((a, b) => b.count - a.count)[0]?.label ?? "Low";
  const diagramNodes: DiagramNode[] = [
    {
      id: "orders",
      title: "Recurring orders",
      value: visualization.orderMatrix.orders.join("\n") || "Order cluster pending",
      x: 24,
      y: 40,
      tone: "accent",
    },
    {
      id: "operator",
      title: "Dominant operator",
      value: visualization.operator,
      x: 24,
      y: 136,
    },
    {
      id: "severity",
      title: "Severity mix",
      value: `${dominantSeverity}-severity\ncosmetic pattern`,
      x: 24,
      y: 232,
      tone: "warning",
    },
    {
      id: "cause",
      title: "Pattern",
      value: "Handling correlation\nacross repeat orders",
      x: 344,
      y: 126,
      width: 220,
      height: 92,
      tone: "danger",
    },
    {
      id: "defects",
      title: "Defect cluster",
      value: `${topMatrixCell?.count ?? 0} strongest links\nin operator matrix`,
      x: 712,
      y: 84,
      tone: "accent",
    },
    {
      id: "action",
      title: "Follow-up",
      value: `${visualization.actionSnapshot.closedActions} closed / ${visualization.actionSnapshot.openActions} open`,
      x: 928,
      y: 168,
      tone: "success",
    },
  ];
  const diagramLinks: DiagramLink[] = [
    { from: "orders", to: "cause", label: "repeat across" },
    { from: "operator", to: "cause", label: "linked to" },
    { from: "severity", to: "cause", label: "narrows to" },
    { from: "cause", to: "defects", label: "shows as" },
    { from: "defects", to: "action", label: "tracked by" },
  ];

  return (
    <div className="story-evidence-layout">
      <p className="story-visual-summary">
        {visualization.summary} Dominant operator: <strong>{visualization.operator}</strong>.
      </p>
      <FlowDiagram nodes={diagramNodes} links={diagramLinks} />
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
          {visualization.annotations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
