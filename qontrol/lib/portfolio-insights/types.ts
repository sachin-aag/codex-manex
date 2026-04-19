import type {
  AnomalyCandidate,
  InsightsContext,
} from "@/lib/portfolio-insights/context";

export type Severity = "critical" | "high" | "medium" | "low";

export type Signal = {
  id: string;
  kind: AnomalyCandidate["kind"];
  title: string;
  caption: string;
  severity: Severity;
  linked_past_decision_id: string | null;
  evidence_refs: string[];
};

export type DecisionEchoDirection =
  | "improved"
  | "worsened"
  | "flat"
  | "insufficient_data";

export type DecisionEcho = {
  initiative_id: string;
  narrative: string;
  direction: DecisionEchoDirection;
};

export type RecommendationKind =
  | "supplier_switch"
  | "recalibration"
  | "design_change"
  | "training"
  | "process_control"
  | "other";

export type RecommendationAction = {
  id: string;
  label: string;
  detail: string;
  kind: RecommendationKind;
  target_scope: Record<string, unknown>;
  estimated_cost: string;
};

export type Recommendation = {
  id: string;
  title: string;
  kind: RecommendationKind;
  reasoning: string;
  target_scope: Record<string, unknown>;
  expected_impact: Record<string, unknown>;
  estimated_cost: string;
  confidence: "low" | "medium" | "high";
  actions: RecommendationAction[];
};

export type InsightsPayload = {
  mode: "llm" | "fallback";
  model?: string;
  generatedAt: string;
  context: InsightsContext;
  signals: Signal[];
  decision_echoes: DecisionEcho[];
  recommendations: Recommendation[];
};
