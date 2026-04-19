import { NextResponse } from "next/server";

import { postgrestRequest } from "@/lib/db/postgrest";
import type {
  Recommendation,
  RecommendationAction,
} from "@/lib/portfolio-insights/types";

export const runtime = "nodejs";

const ALLOWED_KINDS = new Set([
  "supplier_switch",
  "recalibration",
  "design_change",
  "training",
  "process_control",
  "other",
]);

type InsertedRow = {
  initiative_id: string;
};

function allocateInitiativeId(): string {
  return `INI-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
}

/**
 * Best-effort parse of strings like "est. $12k-$18k" / "$500-$1.5k" -> midpoint in USD.
 * Returns null if no dollar tokens present.
 */
function parseCostMidpoint(input: string | null | undefined): number | null {
  if (!input) return null;
  const tokens = input.match(/\$[0-9]+(?:\.[0-9]+)?k?/gi);
  if (!tokens?.length) return null;
  const values = tokens.map((t) => {
    const num = parseFloat(t.replace(/[$,]/g, ""));
    return /k$/i.test(t) ? num * 1000 : num;
  });
  const sum = values.reduce((s, v) => s + v, 0);
  return sum / values.length;
}

export async function POST(request: Request) {
  let body: { recommendation?: Recommendation; action_id?: string | null };
  try {
    body = (await request.json()) as {
      recommendation?: Recommendation;
      action_id?: string | null;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rec = body.recommendation;
  if (!rec || typeof rec !== "object") {
    return NextResponse.json({ error: "Missing `recommendation`" }, { status: 400 });
  }
  if (!rec.title || typeof rec.title !== "string") {
    return NextResponse.json({ error: "Recommendation.title required" }, { status: 400 });
  }
  if (!ALLOWED_KINDS.has(rec.kind)) {
    return NextResponse.json(
      { error: `Unsupported kind: ${rec.kind}` },
      { status: 400 },
    );
  }

  // Optionally anchor to a specific action within the recommendation.
  let action: RecommendationAction | null = null;
  if (body.action_id) {
    const matched = (rec.actions ?? []).find((a) => a.id === body.action_id);
    if (!matched) {
      return NextResponse.json(
        {
          error: `action_id ${body.action_id} not found in recommendation.actions`,
        },
        { status: 400 },
      );
    }
    if (!ALLOWED_KINDS.has(matched.kind)) {
      return NextResponse.json(
        { error: `Unsupported action kind: ${matched.kind}` },
        { status: 400 },
      );
    }
    action = matched;
  }

  const effectiveTitle = action ? action.label : rec.title;
  const effectiveKind = action ? action.kind : rec.kind;
  const effectiveScope = action ? action.target_scope : rec.target_scope;
  const effectiveCostText = action ? action.estimated_cost : rec.estimated_cost;
  const effectiveReasoning = action
    ? [
        action.detail,
        `Part of recommendation "${rec.title}": ${rec.reasoning ?? ""}`.trim(),
      ]
        .filter(Boolean)
        .join("\n\n")
    : rec.reasoning ?? null;

  const payloadBase = {
    title: effectiveTitle,
    kind: effectiveKind,
    status: "proposed" as const,
    source: "agent_proposed" as const,
    reasoning: effectiveReasoning,
    target_scope: {
      ...(effectiveScope ?? {}),
      ...(action
        ? {
            parent_recommendation_id: rec.id,
            parent_recommendation_title: rec.title,
            action_id: action.id,
          }
        : {}),
    },
    expected_impact: {
      ...(rec.expected_impact ?? {}),
      cost_text: effectiveCostText ?? null,
      confidence: rec.confidence ?? null,
      ...(action
        ? {
            parent_recommendation_expected_impact: rec.expected_impact ?? {},
          }
        : {}),
    },
    estimated_cost: parseCostMidpoint(effectiveCostText),
    linked_case_ids: [],
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const initiative_id = allocateInitiativeId();
    try {
      const created = await postgrestRequest<InsertedRow[]>("qontrol_initiative", {
        method: "POST",
        body: { initiative_id, ...payloadBase },
        prefer: "return=representation",
      });
      return NextResponse.json({
        initiative_id: created[0]?.initiative_id ?? initiative_id,
        status: "proposed",
        scope: action ? "action" : "recommendation",
        action_id: action?.id ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate key")) continue;
      return NextResponse.json(
        { error: "Insert failed", details: msg },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { error: "Could not allocate unique initiative_id after retries" },
    { status: 503 },
  );
}
