"use client";

import { memo, useEffect, useMemo, useState } from "react";
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

import type { CaseTraceability, TraceabilityFact } from "@/lib/qontrol-data";

type Props = {
  traceability?: CaseTraceability;
};

type TraceabilityTone = "neutral" | "accent" | "warning" | "danger" | "success";

type TraceabilityNodeData = {
  title: string;
  value: string;
  meta?: string;
  detail: string;
  tone: TraceabilityTone;
  interesting?: boolean;
};

type TraceabilityNodeSpec = {
  id: string;
  title: string;
  value: string;
  meta?: string;
  detail: string;
  tone: TraceabilityTone;
  interesting?: boolean;
  position: { x: number; y: number };
  width?: number;
  sourcePosition?: Position;
  targetPosition?: Position;
};

type TraceabilityEdgeSpec = {
  id: string;
  source: string;
  target: string;
  label: string;
  variant?: "primary" | "support";
};

type TraceabilityBlueprint = {
  nodes: TraceabilityNodeSpec[];
  edges: TraceabilityEdgeSpec[];
  initialSelectedId: string;
  height: number;
};

function factByLabel(facts: TraceabilityFact[], label: string) {
  return facts.find((fact) => fact.label === label);
}

function factValue(facts: TraceabilityFact[], label: string, fallback: string) {
  return factByLabel(facts, label)?.value ?? fallback;
}

function splitCompoundValue(value: string) {
  return value.replaceAll(" / ", "\n");
}

function reachableNodeIds(
  edges: TraceabilityEdgeSpec[],
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

function buildTraceabilityBlueprint(traceability: CaseTraceability): TraceabilityBlueprint {
  const supplier = factValue(traceability.facts, "Supplier", "Supplier not isolated");
  const batch = factValue(traceability.facts, "Batch", "Batch under review");
  const partBom = splitCompoundValue(
    factValue(traceability.facts, "Part / BOM", "Part / BOM pending"),
  );
  const unitIdentity = splitCompoundValue(
    factValue(traceability.facts, "Article / product", "Unit under review"),
  );
  const orderBuild = factValue(traceability.facts, "Order / build", "Order / build pending");
  const occurred = factValue(traceability.facts, "Occurred at", "Occurrence not isolated");
  const discovered = factValue(traceability.facts, "Discovered at", "Detection pending");
  const measurement = factValue(
    traceability.facts,
    "Measurement",
    "Measurement under review",
  );
  const spec = factValue(
    traceability.facts,
    "Deviation / spec",
    "Spec comparison pending",
  );
  const issue = factValue(traceability.facts, "Error", "Issue under review");
  const downstream = factValue(
    traceability.facts,
    "Downstream",
    "Downstream impact pending",
  );
  const operatorSignal = factByLabel(traceability.facts, "Operator / rework");

  const nodes: TraceabilityNodeSpec[] = [
    {
      id: "supplier",
      title: "Supplier",
      value: supplier,
      detail: "Upstream sourcing anchor for the unit under review.",
      tone: "neutral",
      position: { x: 18, y: 30 },
      width: 176,
    },
    {
      id: "batch",
      title: "Batch",
      value: batch,
      detail: "Lot-level traceability anchor. This is usually the most actionable upstream block.",
      tone: factByLabel(traceability.facts, "Batch")?.highlight ? "accent" : "neutral",
      interesting: factByLabel(traceability.facts, "Batch")?.highlight,
      position: { x: 226, y: 30 },
      width: 176,
    },
    {
      id: "partBom",
      title: "Part / BOM",
      value: partBom,
      detail: "Shows which component and BOM slot tie the supplier lot into the build.",
      tone: "neutral",
      position: { x: 434, y: 30 },
      width: 194,
    },
    {
      id: "unit",
      title: "Unit under review",
      value: unitIdentity,
      meta: orderBuild,
      detail: "Combines the article/product identity with the specific order and build context.",
      tone: "accent",
      interesting: true,
      position: { x: 662, y: 30 },
      width: 226,
      sourcePosition: Position.Bottom,
    },
    {
      id: "occurred",
      title: "Likely occurred",
      value: occurred,
      detail: "The section where the defect most likely originated in the manufacturing flow.",
      tone: "warning",
      position: { x: 662, y: 248 },
      width: 204,
      targetPosition: Position.Top,
    },
    {
      id: "discovered",
      title: "Discovered",
      value: discovered,
      detail: "Where the issue first became visible to the organization or the customer.",
      tone: factByLabel(traceability.facts, "Discovered at")?.highlight ? "accent" : "warning",
      interesting: factByLabel(traceability.facts, "Discovered at")?.highlight,
      position: { x: 892, y: 248 },
      width: 204,
    },
    {
      id: "measurement",
      title: "Measurement / spec",
      value: measurement,
      meta: spec,
      detail: "Measured signal plus the spec or pass/fail context used to interpret it.",
      tone: "warning",
      interesting: true,
      position: { x: 1122, y: 248 },
      width: 228,
    },
    {
      id: "issue",
      title: "Issue",
      value: issue,
      detail: "Primary defect or complaint classification driving the investigation.",
      tone: "danger",
      interesting: factByLabel(traceability.facts, "Error")?.highlight ?? true,
      position: { x: 1386, y: 248 },
      width: 218,
    },
    {
      id: "downstream",
      title: operatorSignal ? "Downstream impact" : "Impact",
      value: downstream,
      meta: operatorSignal?.value,
      detail: operatorSignal
        ? "Known downstream impact, plus rework/operator context that may explain how the issue propagated."
        : "Known downstream impact tied to the current traceability path.",
      tone: operatorSignal ? "success" : "warning",
      interesting: true,
      position: { x: 1640, y: 248 },
      width: 234,
    },
  ];

  return {
    initialSelectedId: "issue",
    height: 420,
    nodes,
    edges: [
      { id: "supplier-batch", source: "supplier", target: "batch", label: "lot source" },
      { id: "batch-part", source: "batch", target: "partBom", label: "feeds" },
      { id: "part-unit", source: "partBom", target: "unit", label: "installed into" },
      { id: "unit-occurred", source: "unit", target: "occurred", label: "built through" },
      { id: "occurred-discovered", source: "occurred", target: "discovered", label: "surfaced at" },
      { id: "discovered-measurement", source: "discovered", target: "measurement", label: "measured as" },
      {
        id: "measurement-issue",
        source: "measurement",
        target: "issue",
        label: "supports",
        variant: "support",
      },
      {
        id: "discovered-issue",
        source: "discovered",
        target: "issue",
        label: "classified as",
      },
      { id: "issue-downstream", source: "issue", target: "downstream", label: "impacts" },
    ],
  };
}

function TraceabilityFlowNode({
  data,
  selected,
}: NodeProps<Node<TraceabilityNodeData>>) {
  return (
    <div
      className={`story-traceability-node tone-${data.tone} ${
        selected ? "is-selected" : ""
      } ${data.interesting ? "is-interesting" : ""}`}
    >
      <div className="story-traceability-node-head">
        <span>{data.title}</span>
        {data.interesting ? (
          <strong className="story-traceability-node-chip">Focus</strong>
        ) : null}
      </div>
      <div className="story-traceability-node-value">
        {data.value.split("\n").map((line) => (
          <strong key={`${data.title}-${line}`}>{line}</strong>
        ))}
      </div>
      {data.meta ? <p className="story-traceability-node-meta">{data.meta}</p> : null}
      <Handle type="target" position={Position.Left} className="story-traceability-handle" />
      <Handle type="target" position={Position.Top} className="story-traceability-handle" />
      <Handle type="target" position={Position.Bottom} className="story-traceability-handle" />
      <Handle type="source" position={Position.Right} className="story-traceability-handle" />
      <Handle type="source" position={Position.Bottom} className="story-traceability-handle" />
      <Handle type="source" position={Position.Top} className="story-traceability-handle" />
    </div>
  );
}

const MemoTraceabilityFlowNode = memo(TraceabilityFlowNode);

const nodeTypes = {
  traceability: MemoTraceabilityFlowNode,
};

export function StoryTraceabilityView({ traceability }: Props) {
  if (!traceability) return null;

  const blueprint = useMemo(() => buildTraceabilityBlueprint(traceability), [traceability]);
  const [selectedId, setSelectedId] = useState(blueprint.initialSelectedId);

  useEffect(() => {
    setSelectedId(blueprint.initialSelectedId);
  }, [blueprint.initialSelectedId]);

  const upstream = useMemo(
    () => reachableNodeIds(blueprint.edges, selectedId, "upstream"),
    [blueprint.edges, selectedId],
  );
  const downstream = useMemo(
    () => reachableNodeIds(blueprint.edges, selectedId, "downstream"),
    [blueprint.edges, selectedId],
  );

  const connectedNodeIds = useMemo(() => {
    return new Set([selectedId, ...upstream, ...downstream]);
  }, [downstream, selectedId, upstream]);

  const nodes = useMemo<Node<TraceabilityNodeData>[]>(() => {
    return blueprint.nodes.map((node) => {
      const muted = !connectedNodeIds.has(node.id);
      return {
        id: node.id,
        type: "traceability",
        position: node.position,
        data: {
          title: node.title,
          value: node.value,
          meta: node.meta,
          detail: node.detail,
          tone: node.tone,
          interesting: node.interesting,
        },
        selected: node.id === selectedId,
        draggable: false,
        selectable: true,
        sourcePosition: node.sourcePosition ?? Position.Right,
        targetPosition: node.targetPosition ?? Position.Left,
        style: {
          width: node.width ?? 204,
          opacity: muted ? 0.52 : 1,
        },
      };
    });
  }, [blueprint.nodes, connectedNodeIds, selectedId]);

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
      const isSupport = edge.variant === "support";

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: "smoothstep",
        animated: connected,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: connected ? "var(--brand-strong)" : "var(--border)",
        },
        style: {
          stroke: connected
            ? "var(--brand-strong)"
            : "color-mix(in srgb, var(--border) 84%, var(--surface-muted))",
          strokeWidth: connected ? 3 : 2.1,
          strokeDasharray: isSupport ? "7 5" : undefined,
          opacity: muted ? 0.38 : 1,
        },
        labelStyle: {
          fill: connected ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        },
        labelBgStyle: {
          fill: "var(--surface)",
          fillOpacity: 0.9,
        },
        labelBgPadding: [7, 4],
        labelBgBorderRadius: 999,
      };
    });
  }, [blueprint.edges, downstream, selectedId, upstream]);

  return (
    <section className="story-traceability-widget">
      <div className="story-traceability-header">
        <div>
          <h4>{traceability.title}</h4>
          <p>{traceability.summary}</p>
        </div>
      </div>

      <div className="story-traceability-toolbar">
        <p>Pan, zoom, and click any block to follow the active lineage path.</p>
        <div className="story-traceability-legend" aria-hidden="true">
          <span className="story-traceability-legend-chip tone-neutral">Anchor</span>
          <span className="story-traceability-legend-chip tone-warning">Inspection</span>
          <span className="story-traceability-legend-chip tone-danger">Focus block</span>
        </div>
      </div>

      <div className="story-traceability-flow-shell">
        <div
          className="story-traceability-flow"
          style={{ height: `${blueprint.height}px` }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.45}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            zoomOnDoubleClick={false}
            selectNodesOnDrag={false}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(blueprint.initialSelectedId)}
          >
            <Background gap={26} size={1.1} color="var(--border)" />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </div>
      </div>

      <div className="story-traceability-fact-grid">
        {traceability.facts.map((fact) => (
          <article
            className={`story-traceability-fact ${fact.highlight ? "highlight" : ""}`}
            key={`${fact.label}-${fact.value}`}
          >
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </article>
        ))}
      </div>

      <ul className="bullet-list compact">
        {traceability.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
