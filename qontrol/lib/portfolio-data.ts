import {
  dateRangeAppend,
  timestampRangeAppend,
  type UtcRange,
} from "@/lib/date-range";
import { postgrestRequest } from "@/lib/db/postgrest";

export type ParetoRow = {
  defect_code: string;
  cnt: number;
  cum_share: number;
};

export type DefectTrendRow = {
  week_start: string;
  article_name: string;
  defect_rate: number;
  products_built: number;
  defect_count: number;
};

export type SeverityWeekRow = {
  week: string;
  severity: string;
  cnt: number;
};

export type ClaimLagRow = {
  bucket: string;
  cnt: number;
};

export type QualitySummaryRow = {
  article_id: string;
  article_name: string;
  week_start: string;
  products_built: number;
  defect_count: number;
  claim_count: number;
  rework_count: number;
  avg_rework_minutes: number | null;
  defect_cost_sum: number | null;
  claim_cost_sum: number | null;
  top_defect_code: string | null;
  top_defect_code_count: number | null;
};

export type DefectDetailRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string;
  defect_code: string;
  severity: string;
  article_name: string;
  detected_section_name: string | null;
  occurrence_section_name: string | null;
  reported_part_title: string | null;
  cost: number | null;
  notes: string | null;
};

export type ClaimDetailRow = {
  field_claim_id: string;
  product_id: string;
  claim_ts: string;
  article_name: string;
  article_id?: string;
  complaint_text: string | null;
  reported_part_title: string | null;
  days_from_build: number | null;
  cost: number | null;
  market: string | null;
  product_build_ts?: string | null;
};

export type BomPartRow = {
  product_id: string;
  part_number: string;
  part_title: string | null;
  batch_id: string;
  batch_number: string | null;
  supplier_name: string | null;
  supplier_id: string | null;
  batch_received_date: string | null;
};

export type ReworkRow = {
  rework_id: string;
  product_id: string;
  defect_id: string | null;
  cost: number | null;
  ts?: string | null;
  user_id?: string | null;
};

/**
 * Weekly rollup across all articles (for trend chart).
 * `claim_count` is computed from `field_claim.claim_ts` (ISO week, Monday start),
 * not from `v_quality_summary` (which attributes claims to product build week).
 */
export type WeeklyTrendPoint = {
  week_start: string;
  label: string;
  defect_count: number;
  claim_count: number;
  products_built: number;
};

export type HeatmapCell = {
  detected: string;
  occurred: string;
  count: number;
};

export type SectionHeatmapData = {
  cells: HeatmapCell[];
  detectedOrder: string[];
  occurrenceOrder: string[];
  maxCount: number;
};

export type SeverityStackRow = {
  section: string;
  low: number;
  medium: number;
  high: number;
  critical: number;
  other: number;
};

/** Global defect counts by severity (all defects in the fetched set). */
export type SeverityTotals = {
  low: number;
  medium: number;
  high: number;
  critical: number;
  other: number;
};

export type CostBreakdownData = {
  buckets: { category: string; amount: number }[];
  byDefectCode: { defect_code: string; amount: number }[];
  reworkTotal: number;
};

export type ClaimScatterPoint = {
  id: string;
  x: number;
  y: number;
  article_name: string;
  market: string | null;
  cost: number | null;
  claim_ts: string;
  complaint_excerpt: string;
};

export type BatchRankingRow = {
  batch_id: string;
  batch_number: string;
  supplier_name: string;
  part_title: string;
  total_products: number;
  defective_products: number;
  defect_rate: number;
  received_date: string | null;
};

export async function fetchQualitySummary(
  range?: UtcRange | null,
): Promise<QualitySummaryRow[]> {
  const query: Record<string, string> = {
    order: "week_start.asc",
    select:
      "article_id,article_name,week_start,products_built,defect_count,claim_count,rework_count,avg_rework_minutes,defect_cost_sum,claim_cost_sum,top_defect_code,top_defect_code_count",
  };
  const queryAppend = range
    ? dateRangeAppend("week_start", range.from, range.to)
    : undefined;
  return postgrestRequest<QualitySummaryRow[]>("v_quality_summary", {
    query,
    queryAppend,
  });
}

export async function fetchDefects(
  limit = 2000,
  range?: UtcRange | null,
): Promise<DefectDetailRow[]> {
  const effectiveLimit = range ? Math.max(limit, 100_000) : limit;
  const base: Record<string, string> = {
    order: "defect_ts.desc",
    limit: String(effectiveLimit),
    select:
      "defect_id,product_id,defect_ts,defect_code,severity,article_name,detected_section_name,occurrence_section_name,reported_part_title,cost,notes",
  };
  const queryAppend = range
    ? timestampRangeAppend("defect_ts", range.startIso, range.endIso)
    : undefined;
  return postgrestRequest<DefectDetailRow[]>("v_defect_detail", {
    query: base,
    queryAppend,
  });
}

export async function fetchClaims(
  limit = 50_000,
  range?: UtcRange | null,
): Promise<ClaimDetailRow[]> {
  const effectiveLimit = range ? Math.max(limit, 100_000) : limit;
  const base = {
    order: "claim_ts.desc",
    limit: String(effectiveLimit),
  } as const;
  const fullSelect =
    "field_claim_id,product_id,claim_ts,article_name,complaint_text,reported_part_title,days_from_build,cost,market,product_build_ts";
  const minimalSelect =
    "field_claim_id,product_id,claim_ts,article_name,complaint_text,reported_part_title,days_from_build,cost,market";
  const queryAppend = range
    ? timestampRangeAppend("claim_ts", range.startIso, range.endIso)
    : undefined;
  try {
    return await postgrestRequest<ClaimDetailRow[]>("v_field_claim_detail", {
      query: { ...base, select: fullSelect },
      queryAppend,
    });
  } catch {
    return postgrestRequest<ClaimDetailRow[]>("v_field_claim_detail", {
      query: { ...base, select: minimalSelect },
      queryAppend,
    });
  }
}

export async function fetchBomParts(limit = 8000): Promise<BomPartRow[]> {
  return postgrestRequest<BomPartRow[]>("v_product_bom_parts", {
    query: {
      limit: String(limit),
      select:
        "product_id,part_number,part_title,batch_id,batch_number,supplier_name,supplier_id,batch_received_date",
    },
  });
}

export async function fetchRework(
  limit = 10_000,
  range?: UtcRange | null,
): Promise<ReworkRow[]> {
  const effectiveLimit = range ? Math.max(limit, 100_000) : limit;
  const query: Record<string, string> = {
    limit: String(effectiveLimit),
    order: "ts.desc",
    select: "rework_id,product_id,defect_id,cost,ts,user_id",
  };
  const queryAppend = range
    ? timestampRangeAppend("ts", range.startIso, range.endIso)
    : undefined;
  return postgrestRequest<ReworkRow[]>("rework", {
    query,
    queryAppend,
  });
}

/** All product ids (for catalog defect-rate denominator). */
export async function fetchProductIds(): Promise<string[]> {
  const rows = await postgrestRequest<{ product_id: string }[]>("product", {
    query: { select: "product_id", limit: "100000" },
  });
  return rows.map((r) => r.product_id);
}

/** Compute pareto, severity timeline, trend, claim lag from the raw data. */
export function computePareto(defects: DefectDetailRow[]): ParetoRow[] {
  const counts = new Map<string, number>();
  for (const d of defects) {
    if (!d.defect_code) continue;
    counts.set(d.defect_code, (counts.get(d.defect_code) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const totalCount = sorted.reduce((s, [, c]) => s + c, 0);
  let cumSum = 0;
  return sorted.map(([code, cnt]) => {
    cumSum += cnt;
    return {
      defect_code: code,
      cnt,
      cum_share: totalCount > 0 ? cumSum / totalCount : 0,
    };
  });
}

export function computeSeverityTimeline(
  defects: DefectDetailRow[]
): SeverityWeekRow[] {
  const map = new Map<string, Map<string, number>>();
  for (const d of defects) {
    const w = d.defect_ts.slice(0, 10);
    const weekDate = new Date(w);
    weekDate.setDate(weekDate.getDate() - weekDate.getDay());
    const wk = weekDate.toISOString().slice(0, 10);
    const sev = d.severity ?? "unknown";
    if (!map.has(wk)) map.set(wk, new Map());
    const inner = map.get(wk)!;
    inner.set(sev, (inner.get(sev) ?? 0) + 1);
  }
  const rows: SeverityWeekRow[] = [];
  for (const [wk, inner] of Array.from(map.entries())) {
    for (const [sev, cnt] of Array.from(inner.entries())) {
      rows.push({ week: wk, severity: sev, cnt });
    }
  }
  return rows.sort((a, b) => a.week.localeCompare(b.week));
}

export function computeDefectTrend(
  summary: QualitySummaryRow[]
): DefectTrendRow[] {
  return summary
    .filter((s) => s.products_built > 0)
    .map((s) => ({
      week_start: s.week_start,
      article_name: s.article_name,
      defect_rate: s.defect_count / s.products_built,
      products_built: s.products_built,
      defect_count: s.defect_count,
    }));
}

export function computeClaimLag(claims: ClaimDetailRow[]): ClaimLagRow[] {
  const buckets: Record<string, number> = {
    "0–4 wk": 0,
    "4–8 wk": 0,
    "8–12 wk": 0,
    "12+ wk": 0,
  };
  for (const c of claims) {
    const d = c.days_from_build;
    if (d == null) continue;
    if (d < 28) buckets["0–4 wk"]++;
    else if (d < 56) buckets["4–8 wk"]++;
    else if (d < 84) buckets["8–12 wk"]++;
    else buckets["12+ wk"]++;
  }
  return Object.entries(buckets).map(([bucket, cnt]) => ({ bucket, cnt }));
}

/** Short label for chart axis from week_start (YYYY-MM-DD). */
function weekLabelFromIso(weekStart: string): string {
  const d = weekStart.slice(0, 10);
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return d;
}

/**
 * ISO week (Monday) start in UTC, aligned with PostgreSQL
 * `date_trunc('week', timestamptz)::date` for typical UTC-stored timestamps.
 */
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

/** Field claims per calendar week by claim intake time (`claim_ts`), not build week. */
function claimCountsByClaimWeek(claims: ClaimDetailRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of claims) {
    const ts = c.claim_ts;
    if (!ts) continue;
    const w = weekStartMondayUtc(ts);
    if (!w) continue;
    map.set(w, (map.get(w) ?? 0) + 1);
  }
  return map;
}

/**
 * Sum defects and production per build week from `v_quality_summary`; field claims
 * per intake week from `claims` (`claim_ts`). The DB view buckets claims by product
 * build week — we override claims here so the trend line matches claim reporting dates.
 */
export function computeWeeklyRollup(
  summary: QualitySummaryRow[],
  claims: ClaimDetailRow[] = [],
): WeeklyTrendPoint[] {
  const byWeek = new Map<string, { defect: number; prod: number }>();
  for (const s of summary) {
    const w = s.week_start.slice(0, 10);
    const cur = byWeek.get(w) ?? { defect: 0, prod: 0 };
    cur.defect += s.defect_count ?? 0;
    cur.prod += s.products_built ?? 0;
    byWeek.set(w, cur);
  }
  const claimByWeek = claimCountsByClaimWeek(claims);
  const weekKeys = new Set<string>([
    ...byWeek.keys(),
    ...claimByWeek.keys(),
  ]);
  const sorted = [...weekKeys].sort((a, b) => a.localeCompare(b));
  return sorted.map((week_start) => {
    const v = byWeek.get(week_start);
    return {
      week_start,
      label: weekLabelFromIso(week_start),
      defect_count: v?.defect ?? 0,
      claim_count: claimByWeek.get(week_start) ?? 0,
      products_built: v?.prod ?? 0,
    };
  });
}

export function computeSectionHeatmap(
  defects: DefectDetailRow[]
): SectionHeatmapData {
  const map = new Map<string, number>();
  const detSet = new Set<string>();
  const occSet = new Set<string>();
  for (const d of defects) {
    const dr = d.detected_section_name?.trim() || "Unknown";
    const oc = d.occurrence_section_name?.trim() || "Unknown";
    detSet.add(dr);
    occSet.add(oc);
    const key = `${dr}\x00${oc}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const detectedOrder = Array.from(detSet).sort((a, b) =>
    a.localeCompare(b)
  );
  const occurrenceOrder = Array.from(occSet).sort((a, b) =>
    a.localeCompare(b)
  );
  const cells: HeatmapCell[] = [];
  let maxCount = 0;
  for (const [key, count] of map) {
    const [detected, occurred] = key.split("\x00");
    cells.push({ detected, occurred, count });
    if (count > maxCount) maxCount = count;
  }
  return { cells, detectedOrder, occurrenceOrder, maxCount };
}

function normalizeSeverity(s: string | null | undefined): keyof Omit<
  SeverityStackRow,
  "section"
> {
  const v = (s ?? "").toLowerCase();
  if (v === "low") return "low";
  if (v === "medium") return "medium";
  if (v === "high") return "high";
  if (v === "critical") return "critical";
  return "other";
}

/** Stacked severity counts by occurrence section. */
export function computeSeverityByOccurrence(
  defects: DefectDetailRow[]
): SeverityStackRow[] {
  const bySection = new Map<string, SeverityStackRow>();
  for (const d of defects) {
    const sec = d.occurrence_section_name?.trim() || "Unknown";
    if (!bySection.has(sec)) {
      bySection.set(sec, {
        section: sec,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
        other: 0,
      });
    }
    const row = bySection.get(sec)!;
    const k = normalizeSeverity(d.severity);
    row[k] += 1;
  }
  return Array.from(bySection.values()).sort((a, b) =>
    a.section.localeCompare(b.section)
  );
}

export function computeSeverityTotals(
  defects: DefectDetailRow[],
): SeverityTotals {
  const t: SeverityTotals = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    other: 0,
  };
  for (const d of defects) {
    t[normalizeSeverity(d.severity)] += 1;
  }
  return t;
}

export function computeCostBreakdown(
  defects: DefectDetailRow[],
  claims: ClaimDetailRow[],
  rework: ReworkRow[]
): CostBreakdownData {
  let defectCost = 0;
  const byCode = new Map<string, number>();
  for (const d of defects) {
    const c = Number(d.cost ?? 0);
    defectCost += c;
    if (d.defect_code) {
      byCode.set(
        d.defect_code,
        (byCode.get(d.defect_code) ?? 0) + c
      );
    }
  }
  let claimCost = 0;
  for (const cl of claims) {
    claimCost += Number(cl.cost ?? 0);
  }
  let reworkTotal = 0;
  for (const r of rework) {
    reworkTotal += Number(r.cost ?? 0);
  }
  const buckets = [
    { category: "Internal defects", amount: defectCost },
    { category: "Field claims", amount: claimCost },
    { category: "Rework", amount: reworkTotal },
  ];
  const byDefectCode = Array.from(byCode.entries())
    .map(([defect_code, amount]) => ({ defect_code, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { buckets, byDefectCode, reworkTotal };
}

export function computeClaimScatter(
  claims: ClaimDetailRow[]
): ClaimScatterPoint[] {
  const out: ClaimScatterPoint[] = [];
  for (const c of claims) {
    const buildTs = c.product_build_ts;
    const days = c.days_from_build;
    if (buildTs == null || days == null) continue;
    const x = new Date(buildTs).getTime();
    if (Number.isNaN(x)) continue;
    const excerpt =
      (c.complaint_text ?? "").slice(0, 80) +
      ((c.complaint_text?.length ?? 0) > 80 ? "…" : "");
    out.push({
      id: c.field_claim_id,
      x,
      y: days,
      article_name: c.article_name,
      market: c.market,
      cost: c.cost,
      claim_ts: c.claim_ts,
      complaint_excerpt: excerpt,
    });
  }
  return out;
}

export function computeBomBatchRanking(
  bom: BomPartRow[],
  defects: DefectDetailRow[]
): BatchRankingRow[] {
  const batchMeta = new Map<
    string,
    { batch_number: string; supplier_name: string; part_title: string; received: string | null }
  >();
  const batchProducts = new Map<string, Set<string>>();
  for (const b of bom) {
    if (!batchProducts.has(b.batch_id)) {
      batchProducts.set(b.batch_id, new Set());
      batchMeta.set(b.batch_id, {
        batch_number: b.batch_number ?? b.batch_id,
        supplier_name: b.supplier_name ?? "—",
        part_title: b.part_title ?? b.part_number,
        received: b.batch_received_date,
      });
    }
    batchProducts.get(b.batch_id)!.add(b.product_id);
  }
  const defectiveByProduct = new Set(defects.map((d) => d.product_id));
  const rows: BatchRankingRow[] = [];
  for (const [batch_id, products] of batchProducts) {
    const meta = batchMeta.get(batch_id)!;
    const total = products.size;
    let defCount = 0;
    for (const pid of products) {
      if (defectiveByProduct.has(pid)) defCount += 1;
    }
    rows.push({
      batch_id,
      batch_number: meta.batch_number,
      supplier_name: meta.supplier_name,
      part_title: meta.part_title,
      total_products: total,
      defective_products: defCount,
      defect_rate: total > 0 ? defCount / total : 0,
      received_date: meta.received,
    });
  }
  return rows.sort((a, b) => b.defect_rate - a.defect_rate);
}

export type LearningSignal = {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  story: string;
  why: string;
  evidenceCount: number;
};

export function detectLearnings(
  defects: DefectDetailRow[],
  claims: ClaimDetailRow[]
): LearningSignal[] {
  const signals: LearningSignal[] = [];

  const solderCold = defects.filter((d) => d.defect_code === "SOLDER_COLD");
  if (solderCold.length >= 10) {
    signals.push({
      id: "story1-supplier",
      title: `Supplier batch incident — ${solderCold.length} SOLDER_COLD defects`,
      severity: "high",
      story: "Story 1 · Supplier",
      why: "Products with bad batch (SB-00007) of PM-00008 capacitors show elevated ESR, causing cold solder joints and field failures. Containment and supplier corrective action needed.",
      evidenceCount: solderCold.length,
    });
  }

  const vibFail = defects.filter((d) => d.defect_code === "VIB_FAIL");
  if (vibFail.length >= 5) {
    signals.push({
      id: "story2-calibration",
      title: `Calibration drift — ${vibFail.length} VIB_FAIL defects clustered`,
      severity: "medium",
      story: "Story 2 · Calibration",
      why: "Vibration test failures at Montage Linie 1 during weeks 49–52/2025. Torque wrench drifted out of calibration; self-corrected after KW 2/2026.",
      evidenceCount: vibFail.length,
    });
  }

  const designClaims = claims.filter(
    (c) => c.days_from_build != null && c.days_from_build >= 56
  );
  if (designClaims.length >= 5) {
    signals.push({
      id: "story3-design",
      title: `Design weakness — ${designClaims.length} field claims with 8+ week lag`,
      severity: "high",
      story: "Story 3 · Design / latent",
      why: "Field claims on MC-200 (ART-00001) after 8–12 weeks of operation. Resistor PM-00015 at R33 runs hot under nominal load, causing gradual drift. In-factory tests miss this.",
      evidenceCount: designClaims.length,
    });
  }

  const cosmetic = defects.filter(
    (d) =>
      d.defect_code === "VISUAL_SCRATCH" || d.defect_code === "LABEL_MISALIGN"
  );
  if (cosmetic.length >= 5) {
    signals.push({
      id: "story4-operator",
      title: `Operator handling — ${cosmetic.length} cosmetic defects clustered`,
      severity: "low",
      story: "Story 4 · Operator",
      why: "Cosmetic defects (VISUAL_SCRATCH, LABEL_MISALIGN) cluster on specific production orders. Packaging operator user_042 dominates rework. Coaching and fixture checks recommended.",
      evidenceCount: cosmetic.length,
    });
  }

  return signals;
}
