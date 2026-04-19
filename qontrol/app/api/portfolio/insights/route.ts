import OpenAI from "openai";
import { NextResponse } from "next/server";

import { parseRangeFromSearchParams } from "@/lib/date-range";
import {
  buildInsightsContext,
  type AnomalyCandidate,
  type InsightsContext,
  type PastDecisionWithImpact,
} from "@/lib/portfolio-insights/context";
import {
  DEFAULT_INSIGHTS_MODEL,
  INSIGHTS_RETRY_HINT,
  INSIGHTS_SYSTEM_PROMPT,
} from "@/lib/portfolio-insights/prompt";
import type {
  DecisionEcho,
  InsightsPayload,
  Recommendation,
  RecommendationAction,
  Severity,
  Signal,
} from "@/lib/portfolio-insights/types";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60_000;
const MIN_RECOMMENDATIONS = 2;
const MIN_ACTIONS_PER_REC = 2;
const cache = new Map<string, { at: number; payload: InsightsPayload }>();

function cacheKey(range: { from: string; to: string } | null): string {
  return range ? `${range.from}|${range.to}` : "all";
}

function getOpenAIKey(): string | null {
  const k = process.env.OPENAI_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_INSIGHTS_MODEL;
}

// -----------------------------------------------------------------------------
// Signal helpers (used for both fallback and as reference)
// -----------------------------------------------------------------------------

function signalIdFor(c: AnomalyCandidate): string {
  switch (c.kind) {
    case "article_rate":
      return `sig_article_${c.article_id}`;
    case "section_count":
      return `sig_section_${c.section_name.replace(/\s+/g, "_")}`;
    case "batch_cohort":
      return `sig_batch_${c.batch_id}`;
    case "lag_shift":
      return `sig_lag_${c.article_id}`;
    case "operator":
      return `sig_operator_${c.order_id}`;
  }
}

function severityFor(c: AnomalyCandidate): Severity {
  switch (c.kind) {
    case "article_rate":
      return c.delta_pct >= 150 ? "critical" : c.delta_pct >= 100 ? "high" : "medium";
    case "section_count":
      return c.z_score >= 4 ? "critical" : c.z_score >= 3 ? "high" : "medium";
    case "batch_cohort":
      return c.multiple >= 6 ? "critical" : c.multiple >= 4 ? "high" : "medium";
    case "lag_shift":
      return c.shift_score >= 200 ? "high" : "medium";
    case "operator":
      return "low";
  }
}

function titleFor(c: AnomalyCandidate): string {
  switch (c.kind) {
    case "article_rate":
      return `${c.article_name}: 4wk defect rate ${c.delta_pct.toFixed(0)}% above 12wk median`;
    case "section_count":
      return `${c.section_name}: defect count ${c.z_score.toFixed(1)}\u03C3 above trend`;
    case "batch_cohort":
      return `${c.supplier} \u00B7 ${c.part_number} \u00B7 batch ${c.batch_number}: ${c.multiple.toFixed(1)}x peer median`;
    case "lag_shift":
      return `${c.article_name}: 8-12wk field-lag share up ${c.shift_score.toFixed(0)}%`;
    case "operator":
      return `Order ${c.order_id}: ${(c.share * 100).toFixed(0)}% of rework by ${c.top_operator}`;
  }
}

function evidenceFor(c: AnomalyCandidate): string[] {
  switch (c.kind) {
    case "article_rate":
      return [c.article_id];
    case "section_count":
      return [c.section_name];
    case "batch_cohort":
      return [c.batch_id, c.part_number, c.supplier];
    case "lag_shift":
      return [c.article_id];
    case "operator":
      return [c.order_id, c.top_operator, ...c.top_defect_codes];
  }
}

function fallbackCaption(c: AnomalyCandidate): string {
  switch (c.kind) {
    case "article_rate":
      return `Defect rate for ${c.article_name} is ${c.delta_pct.toFixed(0)}% above its 12-week median. Worth a look at recent supplier or process changes.`;
    case "section_count":
      return `${c.section_name} is logging ${c.count_4wk} defects in the last 4 weeks vs a weekly average of ${c.mean_12wk.toFixed(1)} -- that is ${c.z_score.toFixed(1)}\u03C3 above trend.`;
    case "batch_cohort":
      return `Batch ${c.batch_number} from ${c.supplier} (${c.part_number}) is running at ${(c.batch_rate * 100).toFixed(1)}% defect rate -- ${c.multiple.toFixed(1)}x the peer-batch median for this supplier/part. ${c.batch_products} products exposed.`;
    case "lag_shift":
      return `${c.article_name} claims landing in the 8-12 week lag bucket have more than doubled this month vs the trailing three-month share. Suggests a latent-failure pattern rather than infant mortality.`;
    case "operator":
      return `Order ${c.order_id}: ${c.top_operator} accounts for ${(c.share * 100).toFixed(0)}% of rework events, and the dominant defect codes (${c.top_defect_codes.join(", ")}) are cosmetic.`;
  }
}

function linkedPastDecisionFallback(
  c: AnomalyCandidate,
  decisions: PastDecisionWithImpact[],
): string | null {
  for (const d of decisions) {
    const scope = d.target_scope ?? {};
    if (
      c.kind === "batch_cohort" &&
      d.kind === "supplier_switch" &&
      scope.part_number === c.part_number
    ) {
      return d.initiative_id;
    }
    if (
      c.kind === "section_count" &&
      (d.kind === "recalibration" || d.kind === "process_control") &&
      scope.section_name === c.section_name
    ) {
      return d.initiative_id;
    }
  }
  return null;
}

function buildFallbackSignals(context: InsightsContext): Signal[] {
  return context.anomaly_candidates.map((c) => ({
    id: signalIdFor(c),
    kind: c.kind,
    title: titleFor(c),
    caption: fallbackCaption(c),
    severity: severityFor(c),
    linked_past_decision_id: linkedPastDecisionFallback(
      c,
      context.past_decisions,
    ),
    evidence_refs: evidenceFor(c),
  }));
}

function buildFallbackEchoes(context: InsightsContext): DecisionEcho[] {
  return context.past_decisions.map((d) => {
    const impact = d.impact;
    if (!impact || impact.insufficient_data || impact.delta_pct == null) {
      return {
        initiative_id: d.initiative_id,
        narrative: `Not enough pre/post data to measure the effect of ${d.title}.`,
        direction: "insufficient_data" as const,
      };
    }
    const delta = impact.delta_pct;
    const direction =
      delta < -10 ? ("improved" as const)
      : delta > 10 ? ("worsened" as const)
      : ("flat" as const);
    const magnitude = `${Math.abs(delta).toFixed(0)}%`;
    const narrative =
      direction === "improved"
        ? `${d.title} coincides with a ${magnitude} drop in ${impact.target_kpi_label}.`
        : direction === "worsened"
          ? `${d.title} was followed by a ${magnitude} rise in ${impact.target_kpi_label}.`
          : `${d.title} has had no material effect on ${impact.target_kpi_label}.`;
    return { initiative_id: d.initiative_id, narrative, direction };
  });
}

// -----------------------------------------------------------------------------
// Heuristic recommendation builder (fallback + padding)
// -----------------------------------------------------------------------------

function heuristicRecFor(
  c: AnomalyCandidate,
  context: InsightsContext,
  idx: number,
): Recommendation | null {
  const id = `rec_${idx + 1}`;
  if (c.kind === "batch_cohort") {
    const linked = linkedPastDecisionFallback(c, context.past_decisions);
    const linkedText = linked
      ? ` This cohort traces back to ${linked}.`
      : "";
    const actions: RecommendationAction[] = [
      {
        id: "act_1",
        label: `Revert ${c.part_number} sourcing away from ${c.supplier}`,
        detail: `Stop-ship on the current cohort and source ${c.part_number} from a qualified alternate for the next production order.`,
        kind: "supplier_switch",
        target_scope: {
          part_number: c.part_number,
          current_supplier: c.supplier,
        },
        estimated_cost: "est. $3k-$6k (rush re-order premium)",
      },
      {
        id: "act_2",
        label: `Tighten incoming-quality sampling to 100% on ${c.supplier}`,
        detail: `Move remaining ${c.supplier} ${c.part_number} inventory from default AQL sampling to 100% screening pending a re-qualification decision.`,
        kind: "process_control",
        target_scope: {
          part_number: c.part_number,
          supplier: c.supplier,
          sampling: "100%",
        },
        estimated_cost: "est. $1k-$2k (inspection time)",
      },
      {
        id: "act_3",
        label: "Notify Customer Service of elevated 8-12wk field failure risk",
        detail: `Heads-up to CS so they can pre-stage replacement units and scripted responses for claims on the ${c.part_number} cohort.`,
        kind: "other",
        target_scope: {
          part_number: c.part_number,
          expected_claim_lag_bucket: "8-12 wk",
        },
        estimated_cost: "est. $0 (ops coordination)",
      },
    ];
    return {
      id,
      title: `Rollback or re-qualify ${c.supplier} for ${c.part_number}`,
      kind: "supplier_switch",
      reasoning: `Batch ${c.batch_number} is running ${c.multiple.toFixed(1)}x the peer-batch median (${(c.batch_rate * 100).toFixed(1)}% defect rate across ${c.batch_products} products).${linkedText}`,
      target_scope: {
        part_number: c.part_number,
        current_supplier: c.supplier,
      },
      expected_impact: {
        expected_defect_rate_post: c.supplier_peer_median_rate,
        evidence_batch: c.batch_id,
      },
      estimated_cost: "est. $4k-$8k (re-qualification + tooling)",
      confidence: c.multiple >= 4 ? "high" : "medium",
      actions,
    };
  }
  if (c.kind === "section_count" && !c.is_detection_station) {
    const actions: RecommendationAction[] = [
      {
        id: "act_1",
        label: `Schedule a same-shift recalibration at ${c.section_name}`,
        detail: `Investigate and recalibrate the equipment driving the ${c.count_4wk}-defect cluster at ${c.section_name}.`,
        kind: "recalibration",
        target_scope: { section_name: c.section_name },
        estimated_cost: "est. $500-$1.5k",
      },
      {
        id: "act_2",
        label: `Add a standing 10-week calibration cadence for ${c.section_name}`,
        detail: `Put the equipment at ${c.section_name} on a recurring 10-week maintenance cadence to avoid relapse patterns.`,
        kind: "process_control",
        target_scope: {
          section_name: c.section_name,
          cadence_weeks: 10,
        },
        estimated_cost: "est. $2k/year (recurring)",
      },
    ];
    return {
      id,
      title: `Investigate and recalibrate ${c.section_name}`,
      kind: "recalibration",
      reasoning: `${c.section_name} has logged ${c.count_4wk} defects in the last 4 weeks vs a ${c.mean_12wk.toFixed(1)} weekly average -- ${c.z_score.toFixed(1)} sigma above trend.`,
      target_scope: { section_name: c.section_name },
      expected_impact: { expected_count_reduction_pct: -80 },
      estimated_cost: "est. $500-$1.5k",
      confidence: c.z_score >= 3 ? "high" : "medium",
      actions,
    };
  }
  if (c.kind === "operator") {
    const actions: RecommendationAction[] = [
      {
        id: "act_1",
        label: `Targeted 2-hour refresher for ${c.top_operator}`,
        detail: `Handling / cosmetic-defect refresher focused on ${c.top_defect_codes.join(", ") || "the dominant codes"} for ${c.top_operator}.`,
        kind: "training",
        target_scope: {
          target_operators: [c.top_operator],
          target_codes: c.top_defect_codes,
        },
        estimated_cost: "est. $500-$1k (training time)",
      },
      {
        id: "act_2",
        label: "Walk the SOP with the shift lead",
        detail: `Audit the packaging / label-application SOP on the shift tied to order ${c.order_id} and update it if it is not being followed.`,
        kind: "process_control",
        target_scope: { order_id: c.order_id },
        estimated_cost: "est. $500-$1k",
      },
    ];
    return {
      id,
      title: `Operator retrain tied to order ${c.order_id}`,
      kind: "training",
      reasoning: `${(c.share * 100).toFixed(0)}% of rework on ${c.order_id} attributed to ${c.top_operator}, with cosmetic-dominant defect codes -- consistent with a handling / technique gap, not a product defect.`,
      target_scope: {
        target_operators: [c.top_operator],
        target_codes: c.top_defect_codes,
      },
      expected_impact: { expected_rework_reduction_pct: -50 },
      estimated_cost: "est. $1k-$2k",
      confidence: "medium",
      actions,
    };
  }
  if (c.kind === "article_rate") {
    const actions: RecommendationAction[] = [
      {
        id: "act_1",
        label: `Root-cause review for ${c.article_name}`,
        detail: `Pull the last 4 weeks of defects for ${c.article_name} by section and supplier to isolate what changed vs the 12-week median.`,
        kind: "process_control",
        target_scope: { article_id: c.article_id },
        estimated_cost: "est. $2k (engineering hours)",
      },
      {
        id: "act_2",
        label: "Run targeted end-of-line sampling this week",
        detail: `Temporary 100% sampling on ${c.article_name} until the 4wk rate falls back within the 12wk band.`,
        kind: "process_control",
        target_scope: {
          article_id: c.article_id,
          sampling: "100%",
        },
        estimated_cost: "est. $1k-$2k (inspection time)",
      },
    ];
    return {
      id,
      title: `Root-cause the ${c.article_name} defect-rate spike`,
      kind: "process_control",
      reasoning: `${c.article_name}'s 4-week rolling defect rate is ${c.delta_pct.toFixed(0)}% above its 12-week median; likely downstream of another anomaly.`,
      target_scope: { article_id: c.article_id },
      expected_impact: { expected_rate_return_to_median_weeks: 4 },
      estimated_cost: "est. $3k-$5k",
      confidence: "medium",
      actions,
    };
  }
  if (c.kind === "lag_shift") {
    const actions: RecommendationAction[] = [
      {
        id: "act_1",
        label: `Pull field-failure codes for ${c.article_name} 8-12wk bucket`,
        detail: `Cross-reference the 8-12 week claim cohort against production weeks to identify the shipping window responsible.`,
        kind: "process_control",
        target_scope: { article_id: c.article_id },
        estimated_cost: "est. $1k-$2k",
      },
      {
        id: "act_2",
        label: "Pre-stage replacement units with Customer Service",
        detail: `Prepare CS for a rise in 8-12 week claims on ${c.article_name} so SLA is not impacted.`,
        kind: "other",
        target_scope: { article_id: c.article_id },
        estimated_cost: "est. $0 (ops coordination)",
      },
    ];
    return {
      id,
      title: `Investigate the latent-failure shift on ${c.article_name}`,
      kind: "process_control",
      reasoning: `Claims landing 8-12 weeks after build for ${c.article_name} are ${c.shift_score.toFixed(0)}% above the trailing-3-month share -- a latent-failure pattern, not infant mortality.`,
      target_scope: { article_id: c.article_id },
      expected_impact: { expected_bucket_share_return_pct: -50 },
      estimated_cost: "est. $1k-$3k",
      confidence: "medium",
      actions,
    };
  }
  return null;
}

function buildHeuristicRecommendations(
  context: InsightsContext,
): Recommendation[] {
  const results: Recommendation[] = [];
  const seenScopes = new Set<string>();
  const pushIfUnique = (r: Recommendation | null) => {
    if (!r) return;
    const scopeKey = JSON.stringify([r.kind, r.target_scope]);
    if (seenScopes.has(scopeKey)) return;
    seenScopes.add(scopeKey);
    results.push(r);
  };

  const ranked = [...context.anomaly_candidates];
  // Preserve ordering already set by buildInsightsContext (critical first-ish).

  for (let i = 0; i < ranked.length && results.length < 3; i += 1) {
    const rec = heuristicRecFor(ranked[i], context, results.length);
    pushIfUnique(rec);
  }

  // Generic stable fallback if we are still short.
  if (results.length < MIN_RECOMMENDATIONS) {
    results.push({
      id: `rec_${results.length + 1}`,
      title: "Review portfolio stability and tighten sampling this week",
      kind: "process_control",
      reasoning:
        "No portfolio anomalies cleared the alert threshold, but a weekly sampling review keeps the baseline honest and catches drift early.",
      target_scope: { scope: "portfolio" },
      expected_impact: { expected_anomaly_preempt_rate_pct: 15 },
      estimated_cost: "est. $1k-$2k (inspection time)",
      confidence: "low",
      actions: [
        {
          id: "act_1",
          label: "Spot-check the three sections with highest weekly variance",
          detail: "Walk the top-variance sections with the shift lead and verify SPC charts.",
          kind: "process_control",
          target_scope: { scope: "top_variance_sections" },
          estimated_cost: "est. $500",
        },
        {
          id: "act_2",
          label: "Confirm cost-ribbon categorization matches reality",
          detail: "Reconcile defects + claims + rework cost totals against finance weekly to catch miscategorization before it distorts the baseline.",
          kind: "process_control",
          target_scope: { scope: "cost_ribbon" },
          estimated_cost: "est. $500",
        },
      ],
    });
  }

  return results.slice(0, 3);
}

function buildFallbackPayload(context: InsightsContext): InsightsPayload {
  return {
    mode: "fallback",
    generatedAt: new Date().toISOString(),
    context,
    signals: buildFallbackSignals(context),
    decision_echoes: buildFallbackEchoes(context),
    recommendations: buildHeuristicRecommendations(context),
  };
}

// -----------------------------------------------------------------------------
// LLM call + validation
// -----------------------------------------------------------------------------

function isUnderspec(recs: Recommendation[]): boolean {
  if (!Array.isArray(recs) || recs.length < MIN_RECOMMENDATIONS) return true;
  for (const r of recs) {
    if (!Array.isArray(r.actions) || r.actions.length < MIN_ACTIONS_PER_REC) {
      return true;
    }
  }
  return false;
}

function normalizeRecommendation(
  r: Partial<Recommendation> & { actions?: Partial<RecommendationAction>[] },
  idx: number,
): Recommendation {
  const actions: RecommendationAction[] = (r.actions ?? []).map((a, i) => ({
    id: a.id ?? `act_${i + 1}`,
    label: a.label ?? "",
    detail: a.detail ?? "",
    kind: (a.kind as RecommendationAction["kind"]) ?? "other",
    target_scope: a.target_scope ?? {},
    estimated_cost: a.estimated_cost ?? "est. n/a",
  }));
  return {
    id: r.id ?? `rec_${idx + 1}`,
    title: r.title ?? "",
    kind: (r.kind as Recommendation["kind"]) ?? "other",
    reasoning: r.reasoning ?? "",
    target_scope: r.target_scope ?? {},
    expected_impact: r.expected_impact ?? {},
    estimated_cost: r.estimated_cost ?? "est. n/a",
    confidence: (r.confidence as Recommendation["confidence"]) ?? "medium",
    actions,
  };
}

async function callLlm(
  client: OpenAI,
  model: string,
  userPayload: string,
  retry: boolean,
): Promise<ReturnType<typeof parseResponse> | null> {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ];
  if (retry) {
    messages.push({ role: "user", content: INSIGHTS_RETRY_HINT });
  }
  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
      messages,
    });
    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    return parseResponse(raw);
  } catch {
    return null;
  }
}

function parseResponse(raw: string):
  | {
      signals: Signal[];
      decision_echoes: DecisionEcho[];
      recommendations: Recommendation[];
    }
  | null {
  try {
    const parsed = JSON.parse(raw) as Partial<InsightsPayload>;
    const rawRecs = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [];
    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      decision_echoes: Array.isArray(parsed.decision_echoes)
        ? parsed.decision_echoes
        : [],
      recommendations: rawRecs.map((r, i) => normalizeRecommendation(r, i)),
    };
  } catch {
    return null;
  }
}

async function runLlm(
  context: InsightsContext,
  apiKey: string,
): Promise<
  | {
      signals: Signal[];
      decision_echoes: DecisionEcho[];
      recommendations: Recommendation[];
    }
  | null
> {
  const client = new OpenAI({ apiKey });
  const model = getModel();
  let userPayload = JSON.stringify({ context }, null, 2);
  if (userPayload.length > 120_000) {
    userPayload = userPayload.slice(0, 120_000) + "\n...[truncated]";
  }

  let result = await callLlm(client, model, userPayload, false);
  if (result && isUnderspec(result.recommendations)) {
    const retry = await callLlm(client, model, userPayload, true);
    if (retry) result = retry;
  }
  return result;
}

/** Pads LLM recommendations with heuristic ones if still short or under-spec. */
function padRecommendations(
  llmRecs: Recommendation[],
  context: InsightsContext,
): Recommendation[] {
  const good: Recommendation[] = [];
  for (const r of llmRecs) {
    if (Array.isArray(r.actions) && r.actions.length >= MIN_ACTIONS_PER_REC) {
      good.push(r);
    }
  }
  if (good.length >= MIN_RECOMMENDATIONS) return good.slice(0, 3);

  const heuristic = buildHeuristicRecommendations(context);
  const seen = new Set(good.map((r) => JSON.stringify([r.kind, r.target_scope])));
  for (const h of heuristic) {
    if (good.length >= MIN_RECOMMENDATIONS) break;
    const key = JSON.stringify([h.kind, h.target_scope]);
    if (!seen.has(key)) {
      seen.add(key);
      good.push({ ...h, id: `rec_${good.length + 1}` });
    }
  }
  return good.slice(0, 3);
}

// -----------------------------------------------------------------------------
// GET handler
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  const parsed = parseRangeFromSearchParams(
    new URL(request.url).searchParams,
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const range = parsed.range;

  const key = cacheKey(range);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  let context: InsightsContext;
  try {
    context = await buildInsightsContext(range);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build context";
    return NextResponse.json(
      { error: "PostgREST data fetch failed", details: msg },
      { status: 503 },
    );
  }

  const apiKey = getOpenAIKey();
  if (!apiKey) {
    const payload = buildFallbackPayload(context);
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  }

  const llm = await runLlm(context, apiKey);
  if (!llm) {
    const payload = buildFallbackPayload(context);
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  }

  const recommendations = padRecommendations(llm.recommendations, context);

  const payload: InsightsPayload = {
    mode: "llm",
    model: getModel(),
    generatedAt: new Date().toISOString(),
    context,
    signals: llm.signals.length > 0 ? llm.signals : buildFallbackSignals(context),
    decision_echoes:
      llm.decision_echoes.length > 0
        ? llm.decision_echoes
        : buildFallbackEchoes(context),
    recommendations,
  };
  cache.set(key, { at: Date.now(), payload });
  return NextResponse.json(payload);
}
