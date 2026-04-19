/** Structured JSON returned by the R&D briefing LLM (parsed in the API). */

export type RdActionRequiredItem = {
  case_id: string;
  issue: string;
  severity: string;
  age_days: number;
  linked_defects: string[];
};

export type RdPatternItem = {
  pattern: string;
  affected_cases: string[];
  insight: string;
};

export type RdNextStepItem = {
  action: string;
  related_ids: string[];
  suggested_owner: string;
  priority: string;
};

export type RdBriefingPayload = {
  action_required: RdActionRequiredItem[];
  patterns: RdPatternItem[];
  progress: string[];
  next_steps: RdNextStepItem[];
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function normalizeActionRow(o: Record<string, unknown>): RdActionRequiredItem | null {
  const case_id = typeof o.case_id === "string" ? o.case_id : "";
  if (!case_id) return null;
  return {
    case_id,
    issue: typeof o.issue === "string" ? o.issue : "",
    severity: typeof o.severity === "string" ? o.severity : "medium",
    age_days: typeof o.age_days === "number" ? o.age_days : 0,
    linked_defects: asStringArray(o.linked_defects),
  };
}

function normalizePatternRow(o: Record<string, unknown>): RdPatternItem | null {
  const pattern = typeof o.pattern === "string" ? o.pattern : "";
  if (!pattern) return null;
  return {
    pattern,
    affected_cases: asStringArray(o.affected_cases),
    insight: typeof o.insight === "string" ? o.insight : "",
  };
}

function normalizeNextStepRow(o: Record<string, unknown>): RdNextStepItem | null {
  const action = typeof o.action === "string" ? o.action : "";
  if (!action) return null;
  return {
    action,
    related_ids: asStringArray(o.related_ids),
    suggested_owner:
      typeof o.suggested_owner === "string" ? o.suggested_owner : "",
    priority: typeof o.priority === "string" ? o.priority : "medium",
  };
}

/** Parse model output; strips optional ```json fences. */
export function parseRdBriefingPayload(raw: string): RdBriefingPayload {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }
  const parsed: unknown = JSON.parse(s);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Briefing response must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;

  const action_required: RdActionRequiredItem[] = [];
  if (Array.isArray(o.action_required)) {
    for (const row of o.action_required) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const n = normalizeActionRow(row as Record<string, unknown>);
        if (n) action_required.push(n);
      }
    }
  }

  const patterns: RdPatternItem[] = [];
  if (Array.isArray(o.patterns)) {
    for (const row of o.patterns) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const n = normalizePatternRow(row as Record<string, unknown>);
        if (n) patterns.push(n);
      }
    }
  }

  const progress = Array.isArray(o.progress)
    ? o.progress.filter((x): x is string => typeof x === "string")
    : [];

  const next_steps: RdNextStepItem[] = [];
  if (Array.isArray(o.next_steps)) {
    for (const row of o.next_steps) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const n = normalizeNextStepRow(row as Record<string, unknown>);
        if (n) next_steps.push(n);
      }
    }
  }

  return { action_required, patterns, progress, next_steps };
}
