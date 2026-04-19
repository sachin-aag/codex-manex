import type { UtcRange } from "@/lib/date-range";
import {
  fetchBomParts,
  fetchClaims,
  fetchDefects,
  fetchQualitySummary,
  fetchRework,
} from "@/lib/portfolio-data";
import {
  computeArticleDefectRates,
  computeBatchCohorts,
  computeClaimLagShift,
  computeCostRibbon,
  computeDecisionImpact,
  computeOperatorConcentration,
  computeSectionCounts,
  fetchInitiativesRaw,
  fetchProductsWithOrder,
  type ArticleDefectRate,
  type BatchCohort,
  type CostRibbon,
  type DecisionImpact,
  type InitiativeRecord,
  type LagShift,
  type OperatorConcentration,
  type SectionCount,
} from "@/lib/learnings-data";

export type AnomalyCandidate =
  | ({ kind: "article_rate" } & ArticleDefectRate)
  | ({ kind: "section_count" } & SectionCount)
  | ({ kind: "batch_cohort" } & BatchCohort)
  | ({ kind: "lag_shift" } & LagShift)
  | ({ kind: "operator" } & OperatorConcentration);

export type PastDecisionWithImpact = InitiativeRecord & {
  impact: DecisionImpact | null;
};

export type InsightsContext = {
  as_of: string;
  range: { from: string; to: string } | null;
  baselines: {
    article_rates: ArticleDefectRate[];
    section_counts: SectionCount[];
    batch_cohorts: BatchCohort[];
    lag_shifts: LagShift[];
    operator_concentration: OperatorConcentration[];
    cost_ribbon: CostRibbon;
  };
  past_decisions: PastDecisionWithImpact[];
  anomaly_candidates: AnomalyCandidate[];
};

const TOP_N_BASELINE = 20;
const TOP_N_LAG = 10;
const TOP_N_OPERATOR = 10;
const TOP_N_PAST_DECISIONS = 10;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function buildInsightsContext(
  range?: UtcRange | null,
): Promise<InsightsContext> {
  const [defects, claims, summary, bom, rework, products, initiatives] =
    await Promise.all([
      fetchDefects(2000, range),
      fetchClaims(50_000, range),
      fetchQualitySummary(range),
      safe(fetchBomParts, []),
      safe(() => fetchRework(10_000, range), []),
      safe(fetchProductsWithOrder, []),
      safe(fetchInitiativesRaw, []),
    ]);

  const article_rates = computeArticleDefectRates(summary).slice(
    0,
    TOP_N_BASELINE,
  );
  const section_counts = computeSectionCounts(defects).slice(0, TOP_N_BASELINE);
  const batch_cohorts = computeBatchCohorts(bom, defects).slice(
    0,
    TOP_N_BASELINE,
  );
  const lag_shifts = computeClaimLagShift(claims).slice(0, TOP_N_LAG);
  const operator_concentration = computeOperatorConcentration(
    rework,
    products,
    defects,
  ).slice(0, TOP_N_OPERATOR);
  const cost_ribbon = computeCostRibbon(defects, claims, rework);

  const impactByInitiative = new Map<string, DecisionImpact>();
  for (const impact of computeDecisionImpact(initiatives, {
    defects,
    bom,
    summary,
  })) {
    impactByInitiative.set(impact.initiative_id, impact);
  }
  const past_decisions: PastDecisionWithImpact[] = initiatives
    .slice(0, TOP_N_PAST_DECISIONS)
    .map((ini) => ({
      ...ini,
      impact: impactByInitiative.get(ini.initiative_id) ?? null,
    }));

  const anomaly_candidates: AnomalyCandidate[] = [
    ...article_rates
      .filter((r) => r.is_anomaly)
      .map((r) => ({ kind: "article_rate" as const, ...r })),
    ...section_counts
      .filter((r) => r.is_anomaly)
      .map((r) => ({ kind: "section_count" as const, ...r })),
    ...batch_cohorts
      .filter((r) => r.is_anomaly)
      .map((r) => ({ kind: "batch_cohort" as const, ...r })),
    ...lag_shifts
      .filter((r) => r.is_anomaly)
      .map((r) => ({ kind: "lag_shift" as const, ...r })),
    ...operator_concentration
      .filter((r) => r.is_anomaly)
      .map((r) => ({ kind: "operator" as const, ...r })),
  ];

  return {
    as_of: new Date().toISOString(),
    range: range ? { from: range.from, to: range.to } : null,
    baselines: {
      article_rates,
      section_counts,
      batch_cohorts,
      lag_shifts,
      operator_concentration,
      cost_ribbon,
    },
    past_decisions,
    anomaly_candidates,
  };
}
