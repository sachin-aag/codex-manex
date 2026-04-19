/**
 * Portfolio-Insights baselines and decision-impact measurement.
 *
 * Pure functions that turn the data already fetched by the portfolio route into
 * descriptive baselines (Types A-F) and compute the measured effect of past
 * decisions recorded in `qontrol_initiative`. No React, no LLM, no network
 * beyond the `postgrestRequest` wrapper.
 *
 * Rolling windows anchor on the latest week present in the data (not wall
 * clock) so baselines stay stable regardless of when the demo is run.
 */

import { postgrestRequest } from "@/lib/db/postgrest";
import type {
  BomPartRow,
  ClaimDetailRow,
  DefectDetailRow,
  QualitySummaryRow,
  ReworkRow,
} from "@/lib/portfolio-data";

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type ArticleDefectRate = {
  article_id: string;
  article_name: string;
  rate_4wk: number;
  median_12wk: number;
  delta_pct: number;
  is_anomaly: boolean;
};

export type SectionCount = {
  section_name: string;
  count_4wk: number;
  mean_12wk: number; // weekly mean
  std_12wk: number;
  z_score: number;
  is_anomaly: boolean;
  is_detection_station: boolean;
};

export type BatchCohort = {
  batch_id: string;
  batch_number: string;
  supplier: string;
  part_number: string;
  part_title: string;
  batch_products: number;
  defective_products: number;
  batch_rate: number;
  supplier_peer_median_rate: number;
  multiple: number;
  is_anomaly: boolean;
};

export type LagBucket = "0-4 wk" | "4-8 wk" | "8-12 wk" | "12+ wk";

export type LagShift = {
  article_id: string;
  article_name: string;
  this_month_dist: Record<LagBucket, number>;
  trailing_3mo_dist: Record<LagBucket, number>;
  shift_score: number; // pct change of the 8-12 wk bucket share
  is_anomaly: boolean;
  this_month_key: string; // YYYY-MM
};

export type OperatorConcentration = {
  order_id: string;
  top_operator: string;
  share: number;
  top_defect_codes: string[];
  cosmetic_dominant: boolean;
  is_anomaly: boolean;
};

export type CostRibbonPoint = {
  week_start: string;
  defects_cost: number;
  claims_cost: number;
  rework_cost: number;
  total: number;
};

export type CostRibbon = {
  current_weekly: number;
  oct_baseline: number;
  delta_pct: number;
  delta_usd: number;
  trajectory: CostRibbonPoint[];
};

export type InitiativeRecord = {
  initiative_id: string;
  title: string;
  kind: string;
  status: string;
  decided_at: string | null;
  effective_from: string | null;
  owner: string | null;
  target_scope: Record<string, unknown> | null;
  expected_impact: Record<string, unknown> | null;
  reasoning: string | null;
  estimated_cost: number | null;
  source: string;
  linked_case_ids: string[] | null;
  deck_url: string | null;
  created_at: string;
  updated_at: string;
};

export type DecisionImpact = {
  initiative_id: string;
  target_kpi: string;
  target_kpi_label: string;
  pre_value: number | null;
  post_value: number | null;
  delta_pct: number | null;
  trajectory_points: {
    week_start: string;
    value: number;
    is_post: boolean;
  }[];
  insufficient_data: boolean;
};

export type ProductOrderRow = {
  product_id: string;
  order_id: string | null;
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Sections that are end-of-line detection gates. Excluded from Type B anomaly flags. */
export const DETECTION_STATIONS = new Set<string>(["Pruefung Linie 2"]);

const COSMETIC_PREFIXES = ["VISUAL_", "LABEL_"];

const TYPE_A_ANOMALY_DELTA_PCT = 50;
const TYPE_B_ANOMALY_Z = 2;
const TYPE_C_ANOMALY_MULTIPLE = 3;
const TYPE_C_MIN_BATCH_PRODUCTS = 5;
const TYPE_D_ANOMALY_SHIFT_PCT = 100;
const TYPE_E_ANOMALY_SHARE = 0.6;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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

function monthKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function pctChange(next: number, base: number): number {
  if (base === 0) {
    if (next === 0) return 0;
    return next > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return ((next - base) / base) * 100;
}

function latestWeekStart(rows: { week_start: string }[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    const w = r.week_start.slice(0, 10);
    if (!latest || w > latest) latest = w;
  }
  return latest;
}

function latestWeekStartFromTimestamps(isoTimestamps: string[]): string | null {
  let latest: string | null = null;
  for (const ts of isoTimestamps) {
    const w = weekStartMondayUtc(ts);
    if (!w) continue;
    if (!latest || w > latest) latest = w;
  }
  return latest;
}

function isCosmeticCode(code: string | null): boolean {
  if (!code) return false;
  return COSMETIC_PREFIXES.some((p) => code.startsWith(p));
}

// -----------------------------------------------------------------------------
// Fetchers
// -----------------------------------------------------------------------------

export async function fetchInitiativesRaw(): Promise<InitiativeRecord[]> {
  try {
    return await postgrestRequest<InitiativeRecord[]>("qontrol_initiative", {
      query: {
        select:
          "initiative_id,title,kind,status,decided_at,effective_from,owner,target_scope,expected_impact,reasoning,estimated_cost,source,linked_case_ids,deck_url,created_at,updated_at",
        order: "effective_from.desc.nullslast",
        limit: "500",
      },
    });
  } catch {
    return [];
  }
}

export async function fetchProductsWithOrder(
  limit = 100_000,
): Promise<ProductOrderRow[]> {
  try {
    return await postgrestRequest<ProductOrderRow[]>("product", {
      query: {
        select: "product_id,order_id",
        limit: String(limit),
      },
    });
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// Type A - per-article defect rate, 4wk rolling vs 12wk median weekly rate
// -----------------------------------------------------------------------------

export function computeArticleDefectRates(
  summary: QualitySummaryRow[],
): ArticleDefectRate[] {
  const byArticle = new Map<
    string,
    {
      article_name: string;
      weeks: Map<string, { defects: number; products: number }>;
    }
  >();

  for (const row of summary) {
    if (row.products_built <= 0) continue;
    const w = row.week_start.slice(0, 10);
    const entry = byArticle.get(row.article_id) ?? {
      article_name: row.article_name,
      weeks: new Map(),
    };
    const cell = entry.weeks.get(w) ?? { defects: 0, products: 0 };
    cell.defects += row.defect_count ?? 0;
    cell.products += row.products_built ?? 0;
    entry.weeks.set(w, cell);
    byArticle.set(row.article_id, entry);
  }

  const globalLatest = latestWeekStart(summary);
  if (!globalLatest) return [];

  const window4Start = addWeeksIso(globalLatest, -3); // inclusive of 4 weeks
  const window12End = addWeeksIso(window4Start, -1);
  const window12Start = addWeeksIso(window12End, -11);

  const out: ArticleDefectRate[] = [];
  for (const [article_id, entry] of byArticle) {
    let defects4 = 0;
    let products4 = 0;
    const weeklyRates12: number[] = [];
    for (const [w, cell] of entry.weeks) {
      if (w >= window4Start && w <= globalLatest) {
        defects4 += cell.defects;
        products4 += cell.products;
      }
      if (w >= window12Start && w <= window12End && cell.products > 0) {
        weeklyRates12.push(cell.defects / cell.products);
      }
    }
    const rate_4wk = products4 > 0 ? defects4 / products4 : 0;
    const median_12wk = median(weeklyRates12);
    const delta_pct = pctChange(rate_4wk, median_12wk);
    const is_anomaly =
      Number.isFinite(delta_pct) && delta_pct >= TYPE_A_ANOMALY_DELTA_PCT;
    out.push({
      article_id,
      article_name: entry.article_name,
      rate_4wk,
      median_12wk,
      delta_pct: Number.isFinite(delta_pct) ? delta_pct : 0,
      is_anomaly,
    });
  }
  return out.sort((a, b) => b.delta_pct - a.delta_pct);
}

// -----------------------------------------------------------------------------
// Type B - per-section rolling defect count, 4wk vs 12wk weekly mean/std
// -----------------------------------------------------------------------------

export function computeSectionCounts(
  defects: DefectDetailRow[],
): SectionCount[] {
  const bySection = new Map<string, Map<string, number>>();
  for (const d of defects) {
    const section =
      d.occurrence_section_name?.trim() ||
      d.detected_section_name?.trim() ||
      "Unknown";
    const w = weekStartMondayUtc(d.defect_ts);
    if (!w) continue;
    const weeks = bySection.get(section) ?? new Map<string, number>();
    weeks.set(w, (weeks.get(w) ?? 0) + 1);
    bySection.set(section, weeks);
  }

  const latest = latestWeekStartFromTimestamps(
    defects.map((d) => d.defect_ts),
  );
  if (!latest) return [];

  const window4Start = addWeeksIso(latest, -3);
  const window12End = addWeeksIso(window4Start, -1);
  const window12Start = addWeeksIso(window12End, -11);

  const out: SectionCount[] = [];
  for (const [section, weeks] of bySection) {
    let count_4wk = 0;
    const weekly12: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const w = addWeeksIso(latest, -i);
      count_4wk += weeks.get(w) ?? 0;
    }
    for (let i = 0; i < 12; i += 1) {
      const w = addWeeksIso(window12End, -i);
      if (w < window12Start) break;
      weekly12.push(weeks.get(w) ?? 0);
    }
    const mean_12wk = mean(weekly12);
    const std_12wk = stddev(weekly12);
    const expected4 = mean_12wk * 4;
    const denom = std_12wk * 2; // 4-week aggregate std under weekly independence
    const z_score = denom > 0 ? (count_4wk - expected4) / denom : 0;
    const is_detection_station = DETECTION_STATIONS.has(section);
    out.push({
      section_name: section,
      count_4wk,
      mean_12wk,
      std_12wk,
      z_score,
      is_anomaly: z_score >= TYPE_B_ANOMALY_Z && !is_detection_station,
      is_detection_station,
    });
  }
  return out.sort((a, b) => b.z_score - a.z_score);
}

// -----------------------------------------------------------------------------
// Type C - per-batch cohort defect rate vs supplier peer batches
// -----------------------------------------------------------------------------

export function computeBatchCohorts(
  bom: BomPartRow[],
  defects: DefectDetailRow[],
): BatchCohort[] {
  const defectiveProducts = new Set(defects.map((d) => d.product_id));

  type BatchAgg = {
    batch_id: string;
    batch_number: string;
    supplier: string;
    part_number: string;
    part_title: string;
    products: Set<string>;
  };
  const batches = new Map<string, BatchAgg>();
  for (const b of bom) {
    if (!b.batch_id) continue;
    const agg = batches.get(b.batch_id) ?? {
      batch_id: b.batch_id,
      batch_number: b.batch_number ?? b.batch_id,
      supplier: b.supplier_name ?? "Unknown",
      part_number: b.part_number,
      part_title: b.part_title ?? b.part_number,
      products: new Set<string>(),
    };
    agg.products.add(b.product_id);
    batches.set(b.batch_id, agg);
  }

  // Group peer batches by (supplier, part_number) and collect rates.
  const peerGroups = new Map<string, number[]>();
  const perBatch: {
    agg: BatchAgg;
    batch_rate: number;
    defective_products: number;
  }[] = [];
  for (const agg of batches.values()) {
    const total = agg.products.size;
    let defective = 0;
    for (const pid of agg.products) {
      if (defectiveProducts.has(pid)) defective += 1;
    }
    const rate = total > 0 ? defective / total : 0;
    perBatch.push({ agg, batch_rate: rate, defective_products: defective });
    const key = `${agg.supplier}::${agg.part_number}`;
    const bucket = peerGroups.get(key) ?? [];
    bucket.push(rate);
    peerGroups.set(key, bucket);
  }

  const out: BatchCohort[] = [];
  for (const { agg, batch_rate, defective_products } of perBatch) {
    const key = `${agg.supplier}::${agg.part_number}`;
    const peers = (peerGroups.get(key) ?? []).filter(
      (r, i, arr) => !(arr.length > 1 && r === batch_rate && i === arr.indexOf(batch_rate)),
    );
    // Use full group (including self) for a stable median when sample is tiny.
    const peer_median = median(peerGroups.get(key) ?? []);
    const multiple = peer_median > 0 ? batch_rate / peer_median : batch_rate > 0 ? Number.POSITIVE_INFINITY : 0;
    const batch_products = agg.products.size;
    const is_anomaly =
      Number.isFinite(multiple) &&
      multiple >= TYPE_C_ANOMALY_MULTIPLE &&
      batch_products >= TYPE_C_MIN_BATCH_PRODUCTS;
    out.push({
      batch_id: agg.batch_id,
      batch_number: agg.batch_number,
      supplier: agg.supplier,
      part_number: agg.part_number,
      part_title: agg.part_title,
      batch_products,
      defective_products,
      batch_rate,
      supplier_peer_median_rate: peer_median,
      multiple: Number.isFinite(multiple) ? multiple : 999,
      is_anomaly,
    });
    // keep `peers` to satisfy variable use; the peer_median uses the full group.
    void peers;
  }
  return out.sort((a, b) => b.multiple - a.multiple);
}

// -----------------------------------------------------------------------------
// Type D - per-article claim lag distribution shift
// -----------------------------------------------------------------------------

function bucketLag(days: number | null | undefined): LagBucket | null {
  if (days == null) return null;
  if (days < 28) return "0-4 wk";
  if (days < 56) return "4-8 wk";
  if (days < 84) return "8-12 wk";
  return "12+ wk";
}

function emptyDist(): Record<LagBucket, number> {
  return { "0-4 wk": 0, "4-8 wk": 0, "8-12 wk": 0, "12+ wk": 0 };
}

function bucketShare(dist: Record<LagBucket, number>, bucket: LagBucket): number {
  const total =
    dist["0-4 wk"] + dist["4-8 wk"] + dist["8-12 wk"] + dist["12+ wk"];
  return total > 0 ? dist[bucket] / total : 0;
}

export function computeClaimLagShift(claims: ClaimDetailRow[]): LagShift[] {
  const byArticle = new Map<
    string,
    {
      article_name: string;
      monthly: Map<string, Record<LagBucket, number>>;
    }
  >();
  const months = new Set<string>();
  for (const c of claims) {
    const bucket = bucketLag(c.days_from_build);
    if (!bucket) continue;
    const m = monthKey(c.claim_ts);
    months.add(m);
    const articleKey = c.article_id ?? c.article_name;
    const entry = byArticle.get(articleKey) ?? {
      article_name: c.article_name,
      monthly: new Map<string, Record<LagBucket, number>>(),
    };
    const dist = entry.monthly.get(m) ?? emptyDist();
    dist[bucket] += 1;
    entry.monthly.set(m, dist);
    byArticle.set(articleKey, entry);
  }

  const sortedMonths = [...months].sort();
  const thisMonth = sortedMonths[sortedMonths.length - 1];
  if (!thisMonth) return [];
  const trailing = sortedMonths.slice(-4, -1); // three months prior

  const out: LagShift[] = [];
  for (const [article_id, entry] of byArticle) {
    const thisDist = entry.monthly.get(thisMonth) ?? emptyDist();
    const trailingDist = emptyDist();
    for (const m of trailing) {
      const d = entry.monthly.get(m);
      if (!d) continue;
      trailingDist["0-4 wk"] += d["0-4 wk"];
      trailingDist["4-8 wk"] += d["4-8 wk"];
      trailingDist["8-12 wk"] += d["8-12 wk"];
      trailingDist["12+ wk"] += d["12+ wk"];
    }
    const thisShare = bucketShare(thisDist, "8-12 wk");
    const trailingShare = bucketShare(trailingDist, "8-12 wk");
    const shift_score = pctChange(thisShare, trailingShare);
    const finiteShift = Number.isFinite(shift_score) ? shift_score : 0;
    out.push({
      article_id,
      article_name: entry.article_name,
      this_month_dist: thisDist,
      trailing_3mo_dist: trailingDist,
      shift_score: finiteShift,
      is_anomaly:
        finiteShift >= TYPE_D_ANOMALY_SHIFT_PCT && thisDist["8-12 wk"] >= 2,
      this_month_key: thisMonth,
    });
  }
  return out.sort((a, b) => b.shift_score - a.shift_score);
}

// -----------------------------------------------------------------------------
// Type E - per-order operator concentration
// -----------------------------------------------------------------------------

export function computeOperatorConcentration(
  rework: ReworkRow[],
  products: ProductOrderRow[],
  defects: DefectDetailRow[],
): OperatorConcentration[] {
  const orderByProduct = new Map<string, string>();
  for (const p of products) {
    if (p.order_id) orderByProduct.set(p.product_id, p.order_id);
  }
  const codesByProduct = new Map<string, string[]>();
  for (const d of defects) {
    if (!d.defect_code) continue;
    const arr = codesByProduct.get(d.product_id) ?? [];
    arr.push(d.defect_code);
    codesByProduct.set(d.product_id, arr);
  }

  type OrderAgg = {
    operatorCounts: Map<string, number>;
    total: number;
    codeCounts: Map<string, number>;
  };
  const byOrder = new Map<string, OrderAgg>();

  for (const r of rework) {
    const order = orderByProduct.get(r.product_id);
    if (!order) continue;
    const agg = byOrder.get(order) ?? {
      operatorCounts: new Map<string, number>(),
      total: 0,
      codeCounts: new Map<string, number>(),
    };
    agg.total += 1;
    if (r.user_id) {
      agg.operatorCounts.set(
        r.user_id,
        (agg.operatorCounts.get(r.user_id) ?? 0) + 1,
      );
    }
    for (const code of codesByProduct.get(r.product_id) ?? []) {
      agg.codeCounts.set(code, (agg.codeCounts.get(code) ?? 0) + 1);
    }
    byOrder.set(order, agg);
  }

  const out: OperatorConcentration[] = [];
  for (const [order_id, agg] of byOrder) {
    if (agg.total < 3) continue; // noise floor
    const [topOp, topOpCount] =
      [...agg.operatorCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
        "",
        0,
      ];
    const share = agg.total > 0 ? topOpCount / agg.total : 0;
    const codes = [...agg.codeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);
    const cosmeticDominant =
      codes.length > 0 && codes.every((c) => isCosmeticCode(c));
    out.push({
      order_id,
      top_operator: topOp,
      share,
      top_defect_codes: codes,
      cosmetic_dominant: cosmeticDominant,
      is_anomaly: share >= TYPE_E_ANOMALY_SHARE && cosmeticDominant,
    });
  }
  return out.sort((a, b) => b.share - a.share);
}

// -----------------------------------------------------------------------------
// Type F - cost run-rate ribbon (context, never anomalous)
// -----------------------------------------------------------------------------

export function computeCostRibbon(
  defects: DefectDetailRow[],
  claims: ClaimDetailRow[],
  rework: ReworkRow[],
): CostRibbon {
  type WeekBuckets = {
    defects_cost: number;
    claims_cost: number;
    rework_cost: number;
  };
  const byWeek = new Map<string, WeekBuckets>();
  const bump = (
    ts: string | null | undefined,
    cost: number | null | undefined,
    bucket: keyof WeekBuckets,
  ) => {
    if (!ts) return;
    const w = weekStartMondayUtc(ts);
    if (!w) return;
    const cell =
      byWeek.get(w) ?? { defects_cost: 0, claims_cost: 0, rework_cost: 0 };
    cell[bucket] += Number(cost ?? 0);
    byWeek.set(w, cell);
  };
  for (const d of defects) bump(d.defect_ts, d.cost, "defects_cost");
  for (const c of claims) bump(c.claim_ts, c.cost, "claims_cost");
  for (const r of rework) bump(r.ts ?? null, r.cost, "rework_cost");

  const trajectory: CostRibbonPoint[] = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week_start, cell]) => ({
      week_start,
      defects_cost: cell.defects_cost,
      claims_cost: cell.claims_cost,
      rework_cost: cell.rework_cost,
      total: cell.defects_cost + cell.claims_cost + cell.rework_cost,
    }));

  const latest = trajectory.at(-1);
  const current_weekly = latest?.total ?? 0;

  const octWeeks = trajectory
    .filter((p) => p.week_start.startsWith("2025-10"))
    .map((p) => p.total);
  const oct_baseline = mean(octWeeks);
  const delta_pct = pctChange(current_weekly, oct_baseline);
  const delta_usd = current_weekly - oct_baseline;

  return {
    current_weekly,
    oct_baseline,
    delta_pct: Number.isFinite(delta_pct) ? delta_pct : 0,
    delta_usd,
    trajectory,
  };
}

// -----------------------------------------------------------------------------
// Decision impact - pre/post KPI comparison keyed on effective_from
// -----------------------------------------------------------------------------

type KpiBundle = {
  defects: DefectDetailRow[];
  bom: BomPartRow[];
  summary: QualitySummaryRow[];
};

/** Counts matching a section + optional defect-code filter per week. */
function weeklySectionCounts(
  defects: DefectDetailRow[],
  section: string,
  defectCode: string | null,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of defects) {
    const sec =
      d.occurrence_section_name?.trim() ||
      d.detected_section_name?.trim() ||
      "";
    if (sec !== section) continue;
    if (defectCode && d.defect_code !== defectCode) continue;
    const w = weekStartMondayUtc(d.defect_ts);
    if (!w) continue;
    out.set(w, (out.get(w) ?? 0) + 1);
  }
  return out;
}

/** Defect rate per week for products in a supplier-batch cohort. */
function weeklyBatchCohortRates(
  bom: BomPartRow[],
  defects: DefectDetailRow[],
  partNumber: string,
  supplierName: string,
): Map<string, number> {
  const productsInCohort = new Set<string>();
  for (const b of bom) {
    if (b.part_number !== partNumber) continue;
    if (b.supplier_name !== supplierName) continue;
    productsInCohort.add(b.product_id);
  }
  if (productsInCohort.size === 0) return new Map();
  const weeklyDefective = new Map<string, Set<string>>();
  for (const d of defects) {
    if (!productsInCohort.has(d.product_id)) continue;
    const w = weekStartMondayUtc(d.defect_ts);
    if (!w) continue;
    const set = weeklyDefective.get(w) ?? new Set<string>();
    set.add(d.product_id);
    weeklyDefective.set(w, set);
  }
  const rates = new Map<string, number>();
  for (const [w, set] of weeklyDefective) {
    rates.set(w, set.size / productsInCohort.size);
  }
  return rates;
}

/** Weekly defect rate per article from v_quality_summary. */
function weeklyArticleRates(
  summary: QualitySummaryRow[],
  articleId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of summary) {
    if (s.article_id !== articleId) continue;
    if (s.products_built <= 0) continue;
    const w = s.week_start.slice(0, 10);
    out.set(w, s.defect_count / s.products_built);
  }
  return out;
}

function sumWindow(series: Map<string, number>, from: string, to: string): {
  sum: number;
  count: number;
} {
  let sum = 0;
  let count = 0;
  for (const [w, v] of series) {
    if (w >= from && w <= to) {
      sum += v;
      count += 1;
    }
  }
  return { sum, count };
}

function trajectoryWindow(
  series: Map<string, number>,
  from: string,
  to: string,
  effectiveFrom: string,
): { week_start: string; value: number; is_post: boolean }[] {
  const points: { week_start: string; value: number; is_post: boolean }[] = [];
  for (const [w, v] of series) {
    if (w >= from && w <= to) {
      points.push({ week_start: w, value: v, is_post: w >= effectiveFrom });
    }
  }
  return points.sort((a, b) => a.week_start.localeCompare(b.week_start));
}

type ImpactPick =
  | {
      kind: "section_count";
      label: string;
      series: Map<string, number>;
      aggregate: "sum" | "mean";
    }
  | {
      kind: "article_rate";
      label: string;
      series: Map<string, number>;
      aggregate: "mean";
    }
  | {
      kind: "batch_rate";
      label: string;
      series: Map<string, number>;
      aggregate: "mean";
    }
  | { kind: "none" };

function pickSeries(
  initiative: InitiativeRecord,
  data: KpiBundle,
): ImpactPick {
  const scope = initiative.target_scope ?? {};
  if (initiative.kind === "supplier_switch") {
    const part = (scope.part_number as string | undefined) ?? null;
    const supplier =
      (scope.new_supplier as string | undefined) ??
      (scope.supplier as string | undefined) ??
      null;
    if (part && supplier) {
      return {
        kind: "batch_rate",
        label: `Defect rate for ${part} sourced from ${supplier}`,
        series: weeklyBatchCohortRates(data.bom, data.defects, part, supplier),
        aggregate: "mean",
      };
    }
  }
  if (
    initiative.kind === "recalibration" ||
    initiative.kind === "process_control"
  ) {
    const section = (scope.section_name as string | undefined) ?? null;
    const code = (scope.defect_code as string | undefined) ?? null;
    if (section) {
      return {
        kind: "section_count",
        label: code
          ? `${code} defects at ${section}`
          : `Defects at ${section}`,
        series: weeklySectionCounts(data.defects, section, code),
        aggregate: "sum",
      };
    }
  }
  if (initiative.kind === "design_change") {
    const articleId = (scope.article_id as string | undefined) ?? null;
    if (articleId) {
      return {
        kind: "article_rate",
        label: `Defect rate for ${articleId}`,
        series: weeklyArticleRates(data.summary, articleId),
        aggregate: "mean",
      };
    }
  }
  return { kind: "none" };
}

export function computeDecisionImpact(
  initiatives: InitiativeRecord[],
  data: KpiBundle,
): DecisionImpact[] {
  const out: DecisionImpact[] = [];
  for (const ini of initiatives) {
    if (ini.status !== "completed" && ini.status !== "approved") continue;
    if (!ini.effective_from) continue;
    const pick = pickSeries(ini, data);
    if (pick.kind === "none") continue;

    const eff = ini.effective_from.slice(0, 10);
    const effWeek = weekStartMondayUtc(ini.effective_from);
    if (!effWeek) continue;

    const preEnd = addWeeksIso(effWeek, -1);
    const preStart = addWeeksIso(preEnd, -3);
    const latestInSeries =
      [...pick.series.keys()].sort().at(-1) ?? effWeek;
    const postEnd = latestInSeries;
    const postStart = addWeeksIso(postEnd, -3);

    const pre = sumWindow(pick.series, preStart, preEnd);
    const post = sumWindow(pick.series, postStart, postEnd);

    const insufficient =
      pre.count === 0 ||
      post.count === 0 ||
      (postEnd < effWeek);

    const aggregate = (bucket: { sum: number; count: number }) =>
      pick.kind === "section_count" ? bucket.sum : bucket.count > 0 ? bucket.sum / bucket.count : 0;
    const pre_value = insufficient ? null : aggregate(pre);
    const post_value = insufficient ? null : aggregate(post);
    const delta_pct =
      pre_value != null && post_value != null
        ? pctChange(post_value, pre_value)
        : null;

    const trajectory_points = trajectoryWindow(
      pick.series,
      addWeeksIso(preStart, -4),
      postEnd,
      effWeek,
    );

    out.push({
      initiative_id: ini.initiative_id,
      target_kpi: pick.kind,
      target_kpi_label: pick.label,
      pre_value,
      post_value,
      delta_pct:
        delta_pct == null
          ? null
          : Number.isFinite(delta_pct)
            ? delta_pct
            : null,
      trajectory_points,
      insufficient_data: insufficient,
    });
    void eff;
  }
  return out;
}
