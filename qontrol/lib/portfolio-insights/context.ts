import type { UtcRange } from "@/lib/date-range";
import {
  type DefectDetailRow,
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

export type DefectCodeTrend = {
  defect_code: string;
  recent_count: number;
  prior_count: number;
  delta: number;
  delta_pct: number;
  recent_share: number;
  prior_share: number;
  top_sections: string[];
  top_articles: string[];
};

export type MonthlyDefectMix = {
  month_key: string;
  total_defects: number;
  top_codes: { defect_code: string; count: number }[];
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
    defect_code_trends: DefectCodeTrend[];
    monthly_defect_mix: MonthlyDefectMix[];
  };
  past_decisions: PastDecisionWithImpact[];
  anomaly_candidates: AnomalyCandidate[];
};

const TOP_N_BASELINE = 20;
const TOP_N_LAG = 10;
const TOP_N_OPERATOR = 10;
const TOP_N_PAST_DECISIONS = 10;
const TOP_N_DEFECT_CODE_TRENDS = 8;
const TOP_N_MONTHLY_MIX_CODES = 5;
const TOP_N_MONTHLY_MIX_MONTHS = 6;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function weekStartMondayUtc(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return "";
  const wd = d.getUTCDay();
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  const monday = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + mondayOffset,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

function addWeeksIso(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function latestWeekStartFromDefects(defects: DefectDetailRow[]): string | null {
  let latest: string | null = null;
  for (const defect of defects) {
    const week = weekStartMondayUtc(defect.defect_ts);
    if (!week) continue;
    if (!latest || week > latest) latest = week;
  }
  return latest;
}

function pctChange(next: number, base: number): number {
  if (base === 0) return next === 0 ? 0 : 100;
  return ((next - base) / base) * 100;
}

function monthKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

function topKeys(map: Map<string, number>, limit: number): string[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function computeDefectCodeTrends(defects: DefectDetailRow[]): DefectCodeTrend[] {
  const latestWeek = latestWeekStartFromDefects(defects);
  if (!latestWeek) return [];

  const recentStart = addWeeksIso(latestWeek, -3);
  const recentEndExclusive = addWeeksIso(latestWeek, 1);
  const priorStart = addWeeksIso(latestWeek, -7);
  const priorEndExclusive = recentStart;

  const recentCounts = new Map<string, number>();
  const priorCounts = new Map<string, number>();
  const recentSections = new Map<string, Map<string, number>>();
  const recentArticles = new Map<string, Map<string, number>>();
  let recentTotal = 0;
  let priorTotal = 0;

  for (const defect of defects) {
    const ts = defect.defect_ts.slice(0, 10);
    const code = defect.defect_code || "UNKNOWN";
    if (ts >= recentStart && ts < recentEndExclusive) {
      recentCounts.set(code, (recentCounts.get(code) ?? 0) + 1);
      recentTotal += 1;

      const section =
        defect.occurrence_section_name ??
        defect.detected_section_name ??
        "Unknown section";
      const article = defect.article_name || "Unknown article";

      if (!recentSections.has(code)) recentSections.set(code, new Map());
      if (!recentArticles.has(code)) recentArticles.set(code, new Map());

      const sectionMap = recentSections.get(code)!;
      const articleMap = recentArticles.get(code)!;
      sectionMap.set(section, (sectionMap.get(section) ?? 0) + 1);
      articleMap.set(article, (articleMap.get(article) ?? 0) + 1);
    } else if (ts >= priorStart && ts < priorEndExclusive) {
      priorCounts.set(code, (priorCounts.get(code) ?? 0) + 1);
      priorTotal += 1;
    }
  }

  const allCodes = new Set([
    ...recentCounts.keys(),
    ...priorCounts.keys(),
  ]);

  return Array.from(allCodes)
    .map((defect_code) => {
      const recent_count = recentCounts.get(defect_code) ?? 0;
      const prior_count = priorCounts.get(defect_code) ?? 0;
      return {
        defect_code,
        recent_count,
        prior_count,
        delta: recent_count - prior_count,
        delta_pct: pctChange(recent_count, prior_count),
        recent_share: recentTotal ? recent_count / recentTotal : 0,
        prior_share: priorTotal ? prior_count / priorTotal : 0,
        top_sections: topKeys(recentSections.get(defect_code) ?? new Map(), 3),
        top_articles: topKeys(recentArticles.get(defect_code) ?? new Map(), 3),
      };
    })
    .sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      if (b.recent_count !== a.recent_count) return b.recent_count - a.recent_count;
      return a.defect_code.localeCompare(b.defect_code);
    })
    .slice(0, TOP_N_DEFECT_CODE_TRENDS);
}

function computeMonthlyDefectMix(defects: DefectDetailRow[]): MonthlyDefectMix[] {
  const byMonth = new Map<string, Map<string, number>>();

  for (const defect of defects) {
    const month = monthKey(defect.defect_ts);
    const code = defect.defect_code || "UNKNOWN";
    if (!byMonth.has(month)) byMonth.set(month, new Map());
    const monthMap = byMonth.get(month)!;
    monthMap.set(code, (monthMap.get(code) ?? 0) + 1);
  }

  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-TOP_N_MONTHLY_MIX_MONTHS)
    .map(([month_key, counts]) => ({
      month_key,
      total_defects: Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
      top_codes: Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_N_MONTHLY_MIX_CODES)
        .map(([defect_code, count]) => ({ defect_code, count })),
    }));
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
  const defect_code_trends = computeDefectCodeTrends(defects);
  const monthly_defect_mix = computeMonthlyDefectMix(defects);

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
      defect_code_trends,
      monthly_defect_mix,
    },
    past_decisions,
    anomaly_candidates,
  };
}
