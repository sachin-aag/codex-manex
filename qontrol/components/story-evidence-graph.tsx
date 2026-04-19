"use client";

import { memo, useMemo, useState } from "react";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";

import type { StoryVisualization } from "@/lib/qontrol-data";

type NodeTone = "accent" | "neutral" | "warning" | "danger" | "success";
type NodeKind = "evidence" | "gate";

type StoryGraphNodeData = {
  title: string;
  value: string;
  detail: string[];
  facts: Array<{ label: string; value: string }>;
  tone: NodeTone;
  gateLabel?: "AND" | "OR";
};

type StoryGraphNode = {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  title: string;
  value: string;
  tone?: NodeTone;
  detail?: string[];
  facts?: Array<{ label: string; value: string }>;
  gateLabel?: "AND" | "OR";
  width?: number;
  sourcePosition?: Position;
  targetPosition?: Position;
};

type StoryGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  variant?: "primary" | "support" | "noise";
};

type StoryGraphBlueprint = {
  nodes: StoryGraphNode[];
  edges: StoryGraphEdge[];
  initialSelectedId: string;
  height?: number;
};

type Props = {
  visualization: StoryVisualization;
};

function outcomeCount(
  points: Array<{ label: string; count: number }>,
  label: string,
) {
  return points.find((point) => point.label === label)?.count ?? 0;
}

function formatShortDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function compactGraphValue(value: string) {
  return value.replaceAll("\n", " · ");
}

function compactGraphFact(facts: Array<{ label: string; value: string }>) {
  const priority = ["Measurement", "Deviation", "Relevant info", "Observed at"];

  for (const label of priority) {
    const fact = facts.find((item) => item.label === label);
    if (fact) return fact;
  }

  return facts[0] ?? null;
}

function reachableNodeIds(
  edges: StoryGraphEdge[],
  startId: string,
  direction: "upstream" | "downstream",
) {
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const from = direction === "upstream" ? edge.target : edge.source;
    const to = direction === "upstream" ? edge.source : edge.target;
    const current = adjacency.get(from) ?? [];
    current.push(to);
    adjacency.set(from, current);
  }

  const visited = new Set<string>();
  const queue = [...(adjacency.get(startId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return visited;
}

function buildSupplierGraph(visualization: Extract<StoryVisualization, { kind: "supplier" }>): StoryGraphBlueprint {
  const defectCount =
    visualization.steps.find((step) => step.label === "In-factory defects")?.value ?? "0";
  const claimCount =
    visualization.steps.find((step) => step.label === "Field claims")?.value ?? "0";
  const marginalCount = outcomeCount(visualization.testOutcomes, "MARGINAL");
  const failCount = outcomeCount(visualization.testOutcomes, "FAIL");
  const passCount = outcomeCount(visualization.testOutcomes, "PASS");
  const hitRate = `${Math.round(visualization.defectRate * 100)}%`;
  const hasTestSignal = visualization.testOutcomes.some((point) => point.count > 0);

  return {
    initialSelectedId: "pattern",
    height: 400,
    nodes: [
      {
        id: "batch",
        kind: "evidence",
        title: "Supplier batch",
        value: `${visualization.batchId}\n${visualization.supplierName}`,
        tone: "accent",
        position: { x: 24, y: 44 },
        detail: [
          `Supplier: ${visualization.supplierName}.`,
          `Batch receipt: ${formatShortDate(visualization.receivedDate)}.`,
          "This is the strongest upstream traceability anchor in the story.",
        ],
        facts: [
          { label: "Observed at", value: "Incoming receipt" },
          { label: "Measurement", value: visualization.batchId },
          { label: "Relevant info", value: formatShortDate(visualization.receivedDate) },
        ],
      },
      {
        id: "exposure",
        kind: "evidence",
        title: "Exposure",
        value: `${visualization.exposedProducts} products\nin batch cohort`,
        tone: "neutral",
        position: { x: 24, y: 172 },
        detail: [
          `${visualization.affectedProducts} of ${visualization.exposedProducts} exposed products were affected.`,
          "Use exposure before deciding supplier containment scope.",
        ],
        facts: [
          { label: "Observed at", value: "Installed cohort" },
          {
            label: "Measurement",
            value: `${visualization.affectedProducts}/${visualization.exposedProducts} affected`,
          },
          { label: "Deviation", value: `${hitRate} hit rate` },
        ],
      },
      ...(hasTestSignal
        ? [
            {
              id: "tests",
              kind: "evidence" as const,
              title: "ESR signal",
              value: `${outcomeCount(visualization.testOutcomes, "MARGINAL")} marginal / ${outcomeCount(visualization.testOutcomes, "FAIL")} fail`,
              tone: "warning" as const,
              position: { x: 24, y: 300 },
              detail: [
                `${passCount} PASS on the same cohort.`,
                "Marginal and fail outcomes support the batch hypothesis rather than proving it alone.",
              ],
              facts: [
                { label: "Observed at", value: "ESR measurement" },
                { label: "Measurement", value: `${marginalCount} marginal / ${failCount} fail` },
                { label: "Relevant info", value: `${passCount} pass on same cohort` },
              ],
            },
          ]
        : []),
      {
        id: "pattern",
        kind: "evidence",
        title: "Pattern",
        value: `Incoming material issue\n${visualization.batchId}`,
        tone: "danger",
        position: { x: 322, y: 168 },
        width: 224,
        detail: [
          "The causal chain is batch to installed cohort to factory defects to field claims.",
          ...visualization.annotations,
        ],
        facts: [
          { label: "Observed at", value: "Batch -> assembly -> field" },
          { label: "Measurement", value: `${defectCount} factory / ${claimCount} field` },
          { label: "Deviation", value: `${hitRate} hit rate, delayed claim lag` },
        ],
      },
      {
        id: "factory",
        kind: "evidence",
        title: "Factory signal",
        value: `${defectCount} SOLDER_COLD\ndefect events`,
        tone: "accent",
        position: { x: 648, y: 92 },
        detail: [
          `${defectCount} in-factory defects align to the same similarity pattern.`,
          "These defects establish the production-side signature before field escape.",
        ],
        facts: [
          { label: "Observed at", value: "Factory defect records" },
          { label: "Measurement", value: `${defectCount} SOLDER_COLD events` },
          { label: "Relevant info", value: `${claimCount} field claims downstream` },
        ],
      },
      {
        id: "field",
        kind: "evidence",
        title: "Field impact",
        value: `${claimCount} claims\n4-8 week lag cluster`,
        tone: "warning",
        position: { x: 900, y: 192 },
        detail: [
          `${claimCount} field claims follow the same suspected component exposure path.`,
          "The delay window matters because it ties installation to later customer failure.",
        ],
        facts: [
          { label: "Observed at", value: "Customer field claims" },
          { label: "Measurement", value: `${claimCount} claim(s)` },
          { label: "Deviation", value: "4-8 week lag cluster" },
        ],
      },
    ],
    edges: [
      { id: "batch-pattern", source: "batch", target: "pattern", label: "traceable batch" },
      { id: "exposure-pattern", source: "exposure", target: "pattern", label: "installed into" },
      ...(hasTestSignal ? [{ id: "tests-pattern", source: "tests", target: "pattern", label: "supports" }] : []),
      { id: "pattern-factory", source: "pattern", target: "factory", label: "shows up as" },
      { id: "factory-field", source: "factory", target: "field", label: "escapes to field" },
    ],
  };
}

function buildProcessGraph(visualization: Extract<StoryVisualization, { kind: "process" }>): StoryGraphBlueprint {
  const peakPoint = [...visualization.trend].sort(
    (a, b) =>
      b.defectCount + b.failCount + b.marginalCount - (a.defectCount + a.failCount + a.marginalCount),
  )[0];
  const peakLabel = peakPoint?.label ?? "Peak week";

  return {
    initialSelectedId: "spike",
    height: 520,
    nodes: [
      {
        id: "spike",
        kind: "evidence",
        title: "Top event",
        value: `${peakPoint?.defectCount ?? 0} VIB_FAIL\nin ${peakLabel}`,
        tone: "danger",
        position: { x: 380, y: 24 },
        width: 224,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        detail: [
          "This story is strongest when the spike is short-lived and contained to a specific window.",
          `Peak week ${peakLabel} carries the highest combined defect and test signal.`,
        ],
        facts: [
          { label: "Observed at", value: peakLabel },
          {
            label: "Measurement",
            value: `${peakPoint?.defectCount ?? 0} defects / ${peakPoint?.failCount ?? 0} fail / ${peakPoint?.marginalCount ?? 0} marginal`,
          },
          { label: "Deviation", value: "Short-lived spike, not chronic drift" },
        ],
      },
      {
        id: "gate",
        kind: "gate",
        title: "AND",
        value: "",
        tone: "neutral",
        gateLabel: "AND",
        position: { x: 456, y: 142 },
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        detail: [
          "The process spike needs both a plausible assembly-step cause and a bounded production window.",
        ],
        facts: [
          { label: "Observed at", value: "Causal gate" },
          { label: "Measurement", value: "Assembly step + time window" },
          { label: "Relevant info", value: "Both branches matter here" },
        ],
      },
      {
        id: "pattern",
        kind: "evidence",
        title: "Cause hypothesis",
        value: "Calibration drift\nat assembly step",
        tone: "accent",
        position: { x: 248, y: 238 },
        width: 216,
        sourcePosition: Position.Right,
        targetPosition: Position.Bottom,
        detail: [
          `Focus section: ${visualization.section}.`,
          "Treat this as the most likely process mechanism, not a proven singular root cause.",
        ],
        facts: [
          { label: "Observed at", value: visualization.section },
          {
            label: "Measurement",
            value: `${peakPoint?.failCount ?? 0} fail / ${peakPoint?.marginalCount ?? 0} marginal`,
          },
          { label: "Relevant info", value: "Likely mechanism, not proof" },
        ],
      },
      {
        id: "window",
        kind: "evidence",
        title: "Time window",
        value: `${peakLabel}\ncontained spike`,
        tone: "warning",
        position: { x: 612, y: 238 },
        width: 196,
        sourcePosition: Position.Left,
        targetPosition: Position.Bottom,
        detail: [
          "Contained, time-boxed spikes are more diagnostic than cumulative volume here.",
          "If the pattern disappears after the window closes, that supports process drift over chronic design issues.",
        ],
        facts: [
          { label: "Observed at", value: "Weekly signal window" },
          { label: "Measurement", value: peakLabel },
          { label: "Deviation", value: "Contained production window" },
        ],
      },
      {
        id: "section",
        kind: "evidence",
        title: "Occurrence section",
        value: visualization.section,
        tone: "neutral",
        position: { x: 112, y: 378 },
        detail: [
          "Occurrence section anchors the likely origin of the fault in the production flow.",
        ],
        facts: [
          { label: "Observed at", value: "Occurrence section" },
          { label: "Measurement", value: visualization.section },
          { label: "Relevant info", value: "Most likely origin step" },
        ],
      },
      {
        id: "signal",
        kind: "evidence",
        title: "VIB_TEST support",
        value: `${peakPoint?.marginalCount ?? 0} marginal / ${peakPoint?.failCount ?? 0} fail`,
        tone: "warning",
        position: { x: 376, y: 378 },
        width: 212,
        detail: [
          "Marginal and fail tests help validate the spike around the same period.",
          "This signal supports the drift hypothesis, but the inspection hotspot should not be mistaken for cause.",
        ],
        facts: [
          { label: "Observed at", value: "VIB_TEST measurement" },
          { label: "Measurement", value: `${peakPoint?.failCount ?? 0} fail / ${peakPoint?.marginalCount ?? 0} marginal` },
          { label: "Deviation", value: "Correlates with defect spike" },
        ],
      },
      {
        id: "noise",
        kind: "evidence",
        title: "Noise, not cause",
        value: `${visualization.filteredFalsePositives} false positives\ninspection hotspot`,
        tone: "success",
        position: { x: 860, y: 110 },
        width: 196,
        detail: [
          "Pruefung Linie 2 is a detection hotspot and should be read as an amplifier of visibility, not root cause.",
          `${visualization.filteredFalsePositives} false-positive inspection events were filtered out before pattern scoring.`,
        ],
        facts: [
          { label: "Observed at", value: "Inspection hotspot" },
          { label: "Measurement", value: `${visualization.filteredFalsePositives} false positives filtered` },
          { label: "Relevant info", value: "Detection amplifier, not cause" },
        ],
      },
    ],
    edges: [
      { id: "gate-spike", source: "gate", target: "spike", label: "creates" },
      { id: "pattern-gate", source: "pattern", target: "gate", label: "mechanism" },
      { id: "window-gate", source: "window", target: "gate", label: "only in window" },
      { id: "section-pattern", source: "section", target: "pattern", label: "originates in" },
      { id: "signal-pattern", source: "signal", target: "pattern", label: "supported by", variant: "support" },
      { id: "noise-spike", source: "noise", target: "spike", label: "amplifies detection", variant: "noise" },
    ],
  };
}

function buildDesignGraph(visualization: Extract<StoryVisualization, { kind: "design" }>): StoryGraphBlueprint {
  const dominantLag = [...visualization.lagDistribution].sort((a, b) => b.count - a.count)[0];
  const totalClaims = visualization.claimScatter.length;

  return {
    initialSelectedId: "field",
    height: 500,
    nodes: [
      {
        id: "field",
        kind: "evidence",
        title: "Top event",
        value: `${totalClaims} delayed field claim(s)`,
        tone: "danger",
        position: { x: 350, y: 26 },
        width: 260,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        detail: [
          "This story emerges in customer use rather than through a strong factory defect cluster.",
          `${visualization.overlappingClaims} claim(s) still overlap factory defects, so the pattern is mostly field-only rather than absolute.`,
        ],
        facts: [
          { label: "Observed at", value: "Customer field claims" },
          { label: "Measurement", value: `${totalClaims} delayed claim(s)` },
          { label: "Deviation", value: `${dominantLag?.label ?? "8-12 wk"} after build` },
        ],
      },
      {
        id: "gate",
        kind: "gate",
        title: "AND",
        value: "",
        tone: "neutral",
        gateLabel: "AND",
        position: { x: 456, y: 144 },
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        detail: [
          "The delayed field pattern is best explained when BOM hotspot, delayed stress, and missing factory signal line up together.",
        ],
        facts: [
          { label: "Observed at", value: "Causal gate" },
          { label: "Measurement", value: "BOM + lag + factory gap" },
          { label: "Relevant info", value: "Multi-factor explanation" },
        ],
      },
      {
        id: "bom",
        kind: "evidence",
        title: "BOM hotspot",
        value: `${visualization.assembly}\n${visualization.findNumber}`,
        tone: "accent",
        position: { x: 88, y: 256 },
        width: 212,
        detail: [
          `The hotspot centers on ${visualization.assembly} at ${visualization.findNumber}.`,
          "Use this node to anchor the design review and targeted validation work.",
        ],
        facts: [
          { label: "Observed at", value: "BOM traceability" },
          { label: "Measurement", value: `${visualization.assembly} / ${visualization.findNumber}` },
          { label: "Relevant info", value: "Target for engineering validation" },
        ],
      },
      {
        id: "lag",
        kind: "evidence",
        title: "Use-stress window",
        value: `${dominantLag?.label ?? "8-12 wk"}\nafter build`,
        tone: "warning",
        position: { x: 360, y: 256 },
        width: 212,
        detail: [
          "The failure window suggests customer-use stress that short factory tests are unlikely to catch.",
          `Most common lag bucket: ${dominantLag?.label ?? "not enough evidence yet"}.`,
        ],
        facts: [
          { label: "Observed at", value: "Claim lag analysis" },
          { label: "Measurement", value: dominantLag?.label ?? "Not enough evidence yet" },
          { label: "Deviation", value: "Delayed post-build emergence" },
        ],
      },
      {
        id: "factoryGap",
        kind: "evidence",
        title: "Factory coverage gap",
        value: `${visualization.fieldOnlyClaims} of ${totalClaims}\nclaims lack factory defect`,
        tone: "warning",
        position: { x: 632, y: 256 },
        width: 228,
        detail: [
          `${visualization.fieldOnlyClaims} claim(s) have no linked factory defect.`,
          `${visualization.overlappingClaims} claim(s) still overlap factory data, which is why this remains a strong hypothesis rather than direct proof.`,
        ],
        facts: [
          { label: "Observed at", value: "Factory vs field join" },
          { label: "Measurement", value: `${visualization.fieldOnlyClaims}/${totalClaims} field-only` },
          { label: "Deviation", value: `${visualization.overlappingClaims} still overlap` },
        ],
      },
      {
        id: "hypothesis",
        kind: "evidence",
        title: "Leading hypothesis",
        value: "Latent design weakness\nthermal drift suspected",
        tone: "success",
        position: { x: 886, y: 116 },
        width: 204,
        detail: [
          "Thermal drift is the leading explanation supported by lag, BOM location, and complaint language.",
          "Present it as an engineering hypothesis until dedicated validation proves the mechanism.",
        ],
        facts: [
          { label: "Observed at", value: "Engineering inference" },
          { label: "Measurement", value: "Lag + BOM hotspot + field-only pattern" },
          { label: "Relevant info", value: "Suspected, not directly measured" },
        ],
      },
    ],
    edges: [
      { id: "gate-field", source: "gate", target: "field", label: "explains" },
      { id: "bom-gate", source: "bom", target: "gate", label: "hotspot" },
      { id: "lag-gate", source: "lag", target: "gate", label: "emerges late" },
      { id: "gap-gate", source: "factoryGap", target: "gate", label: "missed in factory" },
      { id: "hypothesis-field", source: "hypothesis", target: "field", label: "interpret as", variant: "support" },
    ],
  };
}

function buildHandlingGraph(visualization: Extract<StoryVisualization, { kind: "handling" }>): StoryGraphBlueprint {
  const dominantSeverity =
    [...visualization.severityMix].sort((a, b) => b.count - a.count)[0]?.label ?? "Low";
  const topMatrixCell = [...visualization.orderMatrix.cells].sort((a, b) => b.count - a.count)[0];

  return {
    initialSelectedId: "join",
    height: 380,
    nodes: [
      {
        id: "orders",
        kind: "evidence",
        title: "Recurring orders",
        value: visualization.orderMatrix.orders.join("\n") || "Order cluster pending",
        tone: "accent",
        position: { x: 24, y: 106 },
        width: 204,
        detail: [
          "The pattern repeats across a small cluster of orders rather than the full plant output.",
        ],
        facts: [
          { label: "Observed at", value: "Recurring order set" },
          { label: "Measurement", value: `${visualization.orderMatrix.orders.length} order(s)` },
          { label: "Relevant info", value: "Clustered, not plant-wide" },
        ],
      },
      {
        id: "join",
        kind: "evidence",
        title: "Discovery join",
        value: "Defect -> rework -> user",
        tone: "success",
        position: { x: 286, y: 106 },
        width: 216,
        detail: [
          "This operator signal is not visible from defects alone.",
          "You need the rework join to surface the user-level pattern.",
        ],
        facts: [
          { label: "Observed at", value: "Defect / rework join" },
          { label: "Measurement", value: `${visualization.orderMatrix.operators.length} operator(s) compared` },
          { label: "Relevant info", value: "Discovery requires joined evidence" },
        ],
      },
      {
        id: "operator",
        kind: "evidence",
        title: "Dominant operator",
        value: visualization.operator,
        tone: "warning",
        position: { x: 564, y: 42 },
        width: 188,
        detail: [
          `Dominant operator in the cluster: ${visualization.operator}.`,
          "Treat this as a targeted coaching or station-handling signal, not a blanket attribution.",
        ],
        facts: [
          { label: "Observed at", value: "Rework records" },
          { label: "Measurement", value: visualization.operator },
          { label: "Relevant info", value: "Station-handling signal" },
        ],
      },
      {
        id: "severity",
        kind: "evidence",
        title: "Severity mix",
        value: `${dominantSeverity}-severity\ncosmetic pattern`,
        tone: "neutral",
        position: { x: 564, y: 184 },
        width: 188,
        detail: [
          "Low severity still matters when the same operator and order cluster repeat.",
        ],
        facts: [
          { label: "Observed at", value: "Defect severity mix" },
          { label: "Measurement", value: dominantSeverity },
          { label: "Relevant info", value: "Mostly cosmetic pattern" },
        ],
      },
      {
        id: "cluster",
        kind: "evidence",
        title: "Fault cluster",
        value: `${topMatrixCell?.count ?? 0} strongest links\nin operator matrix`,
        tone: "danger",
        position: { x: 836, y: 106 },
        width: 208,
        detail: [
          `${topMatrixCell?.count ?? 0} is the strongest order/operator rework link count in the current matrix.`,
          "This is an attribution cluster, not a classical physical fault tree.",
        ],
        facts: [
          { label: "Observed at", value: "Order/operator matrix" },
          { label: "Measurement", value: `${topMatrixCell?.count ?? 0} strongest links` },
          { label: "Deviation", value: "Repeat attribution cluster" },
        ],
      },
      {
        id: "actions",
        kind: "evidence",
        title: "Follow-up",
        value: `${visualization.actionSnapshot.closedActions} closed / ${visualization.actionSnapshot.openActions} open`,
        tone: "accent",
        position: { x: 1104, y: 106 },
        width: 196,
        detail: [
          visualization.actionSnapshot.latestAction,
          "Follow-up closes the loop on training, packaging handling, or station changes.",
        ],
        facts: [
          { label: "Observed at", value: "Corrective action log" },
          {
            label: "Measurement",
            value: `${visualization.actionSnapshot.closedActions} closed / ${visualization.actionSnapshot.openActions} open`,
          },
          { label: "Relevant info", value: "Follow-up in progress" },
        ],
      },
    ],
    edges: [
      { id: "orders-join", source: "orders", target: "join", label: "scope" },
      { id: "join-operator", source: "join", target: "operator", label: "reveals" },
      { id: "join-cluster", source: "join", target: "cluster", label: "surfaces" },
      { id: "severity-cluster", source: "severity", target: "cluster", label: "narrows to" },
      { id: "cluster-actions", source: "cluster", target: "actions", label: "tracked by" },
    ],
  };
}

function buildGraph(visualization: StoryVisualization): StoryGraphBlueprint {
  switch (visualization.kind) {
    case "supplier":
      return buildSupplierGraph(visualization);
    case "process":
      return buildProcessGraph(visualization);
    case "design":
      return buildDesignGraph(visualization);
    case "handling":
      return buildHandlingGraph(visualization);
  }
}

function StoryEvidenceNode({ data, selected }: NodeProps<Node<StoryGraphNodeData>>) {
  return (
    <div
      className={`story-flow-node tone-${data.tone} ${selected ? "is-selected" : ""}`}
      data-tone={data.tone}
    >
      <div className="story-flow-node-title">
        {data.title.split("\n").map((line) => (
          <span key={`${data.title}-${line}`}>{line}</span>
        ))}
      </div>
      <div className="story-flow-node-value">
        {data.value.split("\n").map((line) => (
          <strong key={`${data.value}-${line}`}>{line}</strong>
        ))}
      </div>
      <Handle type="target" position={Position.Left} className="story-flow-handle" />
      <Handle type="target" position={Position.Top} className="story-flow-handle" />
      <Handle type="target" position={Position.Bottom} className="story-flow-handle" />
      <Handle type="source" position={Position.Right} className="story-flow-handle" />
      <Handle type="source" position={Position.Bottom} className="story-flow-handle" />
      <Handle type="source" position={Position.Top} className="story-flow-handle" />
    </div>
  );
}

const MemoStoryEvidenceNode = memo(StoryEvidenceNode);

function StoryGateNode({ data, selected }: NodeProps<Node<StoryGraphNodeData>>) {
  return (
    <div className={`story-flow-gate ${selected ? "is-selected" : ""}`}>
      <span>{data.gateLabel ?? "AND"}</span>
      <Handle type="target" position={Position.Bottom} className="story-flow-handle" />
      <Handle type="source" position={Position.Top} className="story-flow-handle" />
    </div>
  );
}

const MemoStoryGateNode = memo(StoryGateNode);

const nodeTypes = {
  evidence: MemoStoryEvidenceNode,
  gate: MemoStoryGateNode,
};

export function StoryEvidenceGraph({ visualization }: Props) {
  const blueprint = useMemo(() => buildGraph(visualization), [visualization]);
  const [selectedId, setSelectedId] = useState(blueprint.initialSelectedId);

  const upstream = useMemo(
    () => reachableNodeIds(blueprint.edges, selectedId, "upstream"),
    [blueprint.edges, selectedId],
  );
  const downstream = useMemo(
    () => reachableNodeIds(blueprint.edges, selectedId, "downstream"),
    [blueprint.edges, selectedId],
  );

  const nodes = useMemo<Node<StoryGraphNodeData>[]>(() => {
    return blueprint.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: {
        title: node.title,
        value: node.value,
        detail: node.detail ?? [],
        facts: node.facts ?? [],
        tone: node.tone ?? "neutral",
        gateLabel: node.gateLabel,
      },
      selected: node.id === selectedId,
      draggable: false,
      selectable: true,
      sourcePosition: node.sourcePosition ?? Position.Right,
      targetPosition: node.targetPosition ?? Position.Left,
      style: node.kind === "evidence" ? { width: node.width ?? 196 } : undefined,
    }));
  }, [blueprint.nodes, selectedId]);

  const edges = useMemo<Edge[]>(() => {
    return blueprint.edges.map((edge) => {
      const connected =
        edge.source === selectedId ||
        edge.target === selectedId ||
        (upstream.has(edge.source) && upstream.has(edge.target)) ||
        (downstream.has(edge.source) && downstream.has(edge.target)) ||
        (upstream.has(edge.source) && edge.target === selectedId) ||
        (downstream.has(edge.target) && edge.source === selectedId);
      const muted = !connected;
      const isNoise = edge.variant === "noise";
      const isSupport = edge.variant === "support";

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: "smoothstep",
        animated: connected && !isNoise,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isNoise ? "var(--text-muted)" : "var(--brand-strong)",
        },
        style: {
          stroke: isNoise
            ? "var(--text-muted)"
            : connected
              ? "var(--brand-strong)"
              : "color-mix(in srgb, var(--border) 82%, var(--surface-muted))",
          strokeWidth: connected ? 2.8 : 2.1,
          strokeDasharray: isNoise || isSupport ? "7 5" : undefined,
          opacity: muted ? 0.45 : 1,
        },
        labelStyle: {
          fill: "var(--text-muted)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        },
        labelBgStyle: {
          fill: "var(--surface)",
          fillOpacity: 0.88,
        },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 999,
      };
    });
  }, [blueprint.edges, downstream, selectedId, upstream]);

  const selectedNode =
    blueprint.nodes.find((node) => node.id === selectedId) ??
    blueprint.nodes.find((node) => node.id === blueprint.initialSelectedId) ??
    blueprint.nodes[0];
  const detailFact = compactGraphFact(selectedNode?.facts ?? []);

  return (
    <div className="story-graph-shell">
      <div className="story-graph-toolbar">
        <div className="story-graph-toolbar-copy">
          <h4>Causal evidence graph</h4>
          <p>
            Interactive hypothesis map showing the strongest evidence path for the
            current case.
          </p>
        </div>
      </div>
      <div
        className="story-graph-canvas-wrap"
        style={{ height: `${blueprint.height ?? 420}px` }}
      >
        <div className="story-graph-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            nodesDraggable={false}
            nodesConnectable={false}
            zoomOnDoubleClick={false}
            selectNodesOnDrag={false}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(blueprint.initialSelectedId)}
          >
            <Background gap={18} size={1.1} color="var(--border)" />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </div>
        <aside className="story-graph-detail story-graph-detail-overlay">
          <strong className="story-graph-detail-title">{selectedNode?.title}</strong>
          <p className="story-graph-detail-value">{compactGraphValue(selectedNode?.value ?? "")}</p>
          {detailFact ? (
            <div className="story-graph-facts">
              <div className="story-graph-fact" key={`${selectedNode?.id}-${detailFact.label}`}>
                <span>{detailFact.label}</span>
                <strong>{detailFact.value}</strong>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
