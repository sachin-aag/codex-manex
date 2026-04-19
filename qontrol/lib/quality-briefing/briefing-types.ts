/** Structured JSON returned by the quality briefing LLM (parsed in the API). */

export type BriefingActionRequiredItem = {
  id: string;
  product: string;
  issue: string;
  severity: string;
  age_days: number;
};

export type BriefingPatternItem = {
  defect_type: string;
  count: number;
  affected_products: string[];
  trend: string;
};

export type BriefingNextStepItem = {
  action: string;
  related_ids: string[];
  suggested_owner: string;
  priority: string;
};

export type QualityBriefingPayload = {
  action_required: BriefingActionRequiredItem[];
  patterns: BriefingPatternItem[];
  progress: string[];
  next_steps: BriefingNextStepItem[];
};

/** Parse model output; strips optional \`\`\`json fences. */
export function parseBriefingPayload(raw: string): QualityBriefingPayload {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  const parsed: unknown = JSON.parse(s);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Briefing response must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  return {
    action_required: Array.isArray(o.action_required)
      ? (o.action_required as BriefingActionRequiredItem[])
      : [],
    patterns: Array.isArray(o.patterns) ? (o.patterns as BriefingPatternItem[]) : [],
    progress: Array.isArray(o.progress)
      ? o.progress.filter((x): x is string => typeof x === "string")
      : [],
    next_steps: Array.isArray(o.next_steps)
      ? (o.next_steps as BriefingNextStepItem[])
      : [],
  };
}
