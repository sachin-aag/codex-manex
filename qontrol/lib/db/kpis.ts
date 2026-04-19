import {
  dateRangeAppend,
  timestampRangeAppend,
  type UtcRange,
} from "@/lib/date-range";
import type { QualitySummaryRow } from "@/lib/portfolio-data";
import { postgrestRequest } from "@/lib/db/postgrest";

export type DashboardKpis = {
  defectRate: number;
  defectRateLabel: string;
  openActions: number;
  reworkRate: number;
  reworkRateLabel: string;
  avgDaysToClose: number | null;
  avgDaysToCloseLabel: string;
  /** How defect and rework rates were computed (catalog vs rolling window fallback) */
  periodNote: string;
};

type ProductActionRow = {
  action_id: string;
  status: string | null;
};

type CaseStateRow = {
  case_id: string;
  source_row_id: string;
  source_type: "defect" | "claim";
  current_state: string;
  updated_at: string;
};

type DefectTsRow = {
  defect_id: string;
  defect_ts: string | null;
};

type ClaimTsRow = {
  field_claim_id: string;
  claim_ts: string | null;
};

type ReworkLagRow = {
  defect_id: string;
  ts: string | null;
};

type ProductIdRow = {
  product_id: string;
};

const RECENT_WEEKS = 8;

/** Catalog KPIs: distinct defective products / total products; rework rows / total products. */
async function fetchTotalProductCount(): Promise<number | null> {
  try {
    const rows = await postgrestRequest<ProductIdRow[]>("product", {
      query: { select: "product_id", limit: "100000" },
    });
    return rows.length;
  } catch {
    return null;
  }
}

async function fetchDistinctDefectiveProductCount(): Promise<number | null> {
  try {
    const rows = await postgrestRequest<ProductIdRow[]>("v_defect_detail", {
      query: { select: "product_id", limit: "100000" },
    });
    return new Set(rows.map((r) => r.product_id)).size;
  } catch {
    return null;
  }
}

/** Treat as completed (not “open” for the KPI). */
function isOpenActionStatus(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  if (
    s === "closed" ||
    s === "done" ||
    s === "verified"
  ) {
    return false;
  }
  return true;
}

/** Same rolling window as defect rate: last N weeks from v_quality_summary. */
function sumRecentProduction(summary: QualitySummaryRow[]): {
  productsBuilt: number;
  defectCount: number;
  reworkCount: number;
} {
  const recent = summary.slice(-RECENT_WEEKS);
  let productsBuilt = 0;
  let defectCount = 0;
  let reworkCount = 0;
  for (const row of recent) {
    productsBuilt += row.products_built ?? 0;
    defectCount += row.defect_count ?? 0;
    reworkCount += row.rework_count ?? 0;
  }
  return { productsBuilt, defectCount, reworkCount };
}

async function fetchOptional<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** PostgREST `in.(a,b)` is unreliable via URLSearchParams; use `or=(col.eq.a,col.eq.b)`. */
const OR_CHUNK = 25;

function orEqClause(column: string, ids: string[]): string {
  return ids.map((id) => `${column}.eq.${id}`).join(",");
}

/** Timestamps only for IDs we need — avoids missing rows when views are limited. */
async function fetchDefectTsForIds(
  ids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += OR_CHUNK) {
    const chunk = unique.slice(i, i + OR_CHUNK);
    try {
      const rows = await postgrestRequest<DefectTsRow[]>("v_defect_detail", {
        query: {
          select: "defect_id,defect_ts",
          or: `(${orEqClause("defect_id", chunk)})`,
        },
      });
      for (const r of rows) {
        map.set(r.defect_id, r.defect_ts);
      }
    } catch {
      /* skip chunk */
    }
  }
  return map;
}

async function fetchClaimTsForIds(
  ids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += OR_CHUNK) {
    const chunk = unique.slice(i, i + OR_CHUNK);
    try {
      const rows = await postgrestRequest<ClaimTsRow[]>("v_field_claim_detail", {
        query: {
          select: "field_claim_id,claim_ts",
          or: `(${orEqClause("field_claim_id", chunk)})`,
        },
      });
      for (const r of rows) {
        map.set(r.field_claim_id, r.claim_ts);
      }
    } catch {
      /* skip chunk */
    }
  }
  return map;
}

/** When Qontrol has no closed rows, approximate response time: defect capture → first rework in the row set. */
function avgDaysDefectToRework(
  reworkRows: ReworkLagRow[],
  defectTs: Map<string, string | null>,
): number | null {
  const earliestTsByDefect = new Map<string, string>();
  for (const r of reworkRows) {
    if (!r.defect_id || !r.ts) continue;
    const prev = earliestTsByDefect.get(r.defect_id);
    const t = new Date(r.ts).getTime();
    if (!Number.isFinite(t)) continue;
    if (prev == null || t < new Date(prev).getTime()) {
      earliestTsByDefect.set(r.defect_id, r.ts);
    }
  }

  const deltas: number[] = [];
  for (const [defectId, ts] of earliestTsByDefect) {
    const cap = defectTs.get(defectId);
    if (!cap) continue;
    const t0 = new Date(cap).getTime();
    const t1 = new Date(ts).getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) continue;
    deltas.push((t1 - t0) / (1000 * 60 * 60 * 24));
  }
  if (deltas.length === 0) return null;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

export type FetchDashboardKpisOpts = {
  /** All KPIs are computed within this window when provided. */
  range: UtcRange;
};

async function fetchDashboardKpisForRange(range: UtcRange): Promise<DashboardKpis> {
  const summary =
    (await fetchOptional(() =>
      postgrestRequest<QualitySummaryRow[]>("v_quality_summary", {
        query: {
          order: "week_start.asc",
          select:
            "article_id,article_name,week_start,products_built,defect_count,claim_count,rework_count",
        },
        queryAppend: dateRangeAppend("week_start", range.from, range.to),
      }),
    )) ?? [];

  let productsBuilt = 0;
  let defectCount = 0;
  let reworkCount = 0;
  for (const row of summary) {
    productsBuilt += row.products_built ?? 0;
    defectCount += row.defect_count ?? 0;
    reworkCount += row.rework_count ?? 0;
  }

  const defectRate =
    productsBuilt > 0 ? defectCount / productsBuilt : 0;
  const reworkRate =
    productsBuilt > 0 ? reworkCount / productsBuilt : 0;
  const defectRatePct = defectRate * 100;
  const reworkRatePct = reworkRate * 100;

  const rangeTsAppend = timestampRangeAppend(
    "ts",
    range.startIso,
    range.endIso,
  );
  const actions = await fetchOptional(() =>
    postgrestRequest<ProductActionRow[]>("product_action", {
      query: {
        select: "action_id,status",
        limit: "20000",
      },
      queryAppend: rangeTsAppend,
    }),
  );

  const openActions = (actions ?? []).filter((a) =>
    isOpenActionStatus(a.status),
  ).length;

  const closedStatesList = await fetchOptional(() =>
    postgrestRequest<CaseStateRow[]>("qontrol_case_state", {
      query: {
        select: "case_id,source_row_id,source_type,current_state,updated_at",
        current_state: "eq.closed",
        limit: "5000",
      },
      queryAppend: timestampRangeAppend(
        "updated_at",
        range.startIso,
        range.endIso,
      ),
    }),
  );
  const reworkRowsList = await fetchOptional(() =>
    postgrestRequest<ReworkLagRow[]>("rework", {
      query: {
        select: "defect_id,ts",
        order: "ts.asc",
        limit: "20000",
      },
      queryAppend: rangeTsAppend,
    }),
  );

  const closedStates = closedStatesList ?? [];
  const reworkRows = reworkRowsList ?? [];

  const defectCaseIds = closedStates
    .filter((r) => r.source_type === "defect")
    .flatMap((r) => [r.case_id, r.source_row_id].filter(Boolean));
  const claimCaseIds = closedStates
    .filter((r) => r.source_type === "claim")
    .flatMap((r) => [r.case_id, r.source_row_id].filter(Boolean));

  const defectIdsForReworkFallback = [
    ...new Set(reworkRows.map((r) => r.defect_id)),
  ];

  const [defectTsQontrol, claimTsById, defectTsForRework] = await Promise.all([
    defectCaseIds.length > 0
      ? fetchDefectTsForIds(defectCaseIds)
      : Promise.resolve(new Map<string, string | null>()),
    claimCaseIds.length > 0
      ? fetchClaimTsForIds(claimCaseIds)
      : Promise.resolve(new Map<string, string | null>()),
    defectIdsForReworkFallback.length > 0
      ? fetchDefectTsForIds(defectIdsForReworkFallback)
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  const defectTsMerged = new Map(defectTsQontrol);
  for (const [k, v] of defectTsForRework) {
    if (!defectTsMerged.has(k)) defectTsMerged.set(k, v);
  }

  const closeDeltasDays: number[] = [];
  for (const row of closedStates) {
    const closedAt = new Date(row.updated_at).getTime();
    let openedAt: number | null = null;
    if (row.source_type === "defect") {
      const ts =
        defectTsMerged.get(row.case_id) ??
        defectTsMerged.get(row.source_row_id);
      if (ts) openedAt = new Date(ts).getTime();
    } else {
      const ts =
        claimTsById.get(row.case_id) ??
        claimTsById.get(row.source_row_id);
      if (ts) openedAt = new Date(ts).getTime();
    }
    if (openedAt != null && Number.isFinite(closedAt) && closedAt >= openedAt) {
      const days = (closedAt - openedAt) / (1000 * 60 * 60 * 24);
      closeDeltasDays.push(days);
    }
  }

  const avgFromQontrol =
    closeDeltasDays.length > 0
      ? closeDeltasDays.reduce((a, b) => a + b, 0) / closeDeltasDays.length
      : null;
  const avgFromRework = avgDaysDefectToRework(reworkRows, defectTsMerged);
  const avgDaysToClose = avgFromQontrol ?? avgFromRework ?? null;

  const periodNote =
    `Filtered window: ${range.from} – ${range.to} (UTC). ` +
    `Defect and rework rates use sums of defect_count and rework_count vs. products_built from ` +
    `v_quality_summary rows with week_start in range (not catalog-wide). ` +
    `Open actions, avg. time to close, and rework fallback use the same window ` +
    `(product_action.ts, qontrol_case_state.updated_at, rework.ts).`;

  return {
    defectRate,
    defectRateLabel:
      defectRatePct < 0.01 && defectRate > 0
        ? `${(defectRate * 10000).toFixed(2)} bps`
        : `${defectRatePct.toFixed(2)}%`,
    openActions,
    reworkRate,
    reworkRateLabel:
      reworkRatePct < 0.01 && reworkRate > 0
        ? `${(reworkRate * 10000).toFixed(2)} bps`
        : `${reworkRatePct.toFixed(2)}%`,
    avgDaysToClose,
    avgDaysToCloseLabel:
      avgDaysToClose == null
        ? "—"
        : avgFromQontrol != null
          ? `${avgFromQontrol.toFixed(1)} days (capture → Qontrol closure)`
          : `${avgFromRework!.toFixed(1)} days — avg. time to first rework`,
    periodNote,
  };
}

async function fetchDashboardKpisGlobal(): Promise<DashboardKpis> {
  const [
    summary,
    actions,
    closedStatesList,
    reworkRowsList,
    catalogProductCount,
    catalogDistinctDefectiveProducts,
  ] = await Promise.all([
    fetchOptional(() =>
      postgrestRequest<QualitySummaryRow[]>("v_quality_summary", {
        query: { order: "week_start.asc" },
      }),
    ),
    fetchOptional(() =>
      postgrestRequest<ProductActionRow[]>("product_action", {
        query: {
          select: "action_id,status",
          limit: "20000",
        },
      }),
    ),
    fetchOptional(() =>
      postgrestRequest<CaseStateRow[]>("qontrol_case_state", {
        query: {
          select: "case_id,source_row_id,source_type,current_state,updated_at",
          current_state: "eq.closed",
          limit: "5000",
        },
      }),
    ),
    fetchOptional(() =>
      postgrestRequest<ReworkLagRow[]>("rework", {
        query: {
          select: "defect_id,ts",
          order: "ts.desc",
          limit: "200000",
        },
      }),
    ),
    fetchOptional(fetchTotalProductCount),
    fetchOptional(fetchDistinctDefectiveProductCount),
  ]);

  const closedStates = closedStatesList ?? [];
  const reworkRows = reworkRowsList ?? [];

  const defectCaseIds = closedStates
    .filter((r) => r.source_type === "defect")
    .flatMap((r) => [r.case_id, r.source_row_id].filter(Boolean));
  const claimCaseIds = closedStates
    .filter((r) => r.source_type === "claim")
    .flatMap((r) => [r.case_id, r.source_row_id].filter(Boolean));

  const defectIdsForReworkFallback = [
    ...new Set(reworkRows.map((r) => r.defect_id)),
  ];

  const [defectTsQontrol, claimTsById, defectTsForRework] = await Promise.all([
    defectCaseIds.length > 0
      ? fetchDefectTsForIds(defectCaseIds)
      : Promise.resolve(new Map<string, string | null>()),
    claimCaseIds.length > 0
      ? fetchClaimTsForIds(claimCaseIds)
      : Promise.resolve(new Map<string, string | null>()),
    defectIdsForReworkFallback.length > 0
      ? fetchDefectTsForIds(defectIdsForReworkFallback)
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  const defectTsMerged = new Map(defectTsQontrol);
  for (const [k, v] of defectTsForRework) {
    if (!defectTsMerged.has(k)) defectTsMerged.set(k, v);
  }

  const safeSummary = summary ?? [];
  const { productsBuilt, defectCount, reworkCount } =
    sumRecentProduction(safeSummary);

  const totalProducts = catalogProductCount ?? 0;
  const distinctDefectiveProducts = catalogDistinctDefectiveProducts ?? 0;
  const reworkEventCount = reworkRows.length;

  let defectRate: number;
  let reworkRate: number;
  let periodNote: string;

  if (totalProducts > 0 && catalogDistinctDefectiveProducts != null) {
    defectRate = distinctDefectiveProducts / totalProducts;
    reworkRate = reworkEventCount / totalProducts;
    periodNote =
      `Catalog: ${distinctDefectiveProducts} defective products / ${totalProducts} products; ${reworkEventCount} rework events / ${totalProducts} products`;
  } else {
    defectRate =
      productsBuilt > 0 ? defectCount / productsBuilt : 0;
    reworkRate =
      productsBuilt > 0 ? reworkCount / productsBuilt : 0;
    periodNote = `Last ${RECENT_WEEKS} weeks (v_quality_summary fallback — catalog product counts unavailable)`;
  }

  const defectRatePct = defectRate * 100;

  const openActions = (actions ?? []).filter((a) =>
    isOpenActionStatus(a.status),
  ).length;

  const reworkRatePct = reworkRate * 100;

  const closeDeltasDays: number[] = [];
  for (const row of closedStates) {
    const closedAt = new Date(row.updated_at).getTime();
    let openedAt: number | null = null;
    if (row.source_type === "defect") {
      const ts =
        defectTsMerged.get(row.case_id) ??
        defectTsMerged.get(row.source_row_id);
      if (ts) openedAt = new Date(ts).getTime();
    } else {
      const ts =
        claimTsById.get(row.case_id) ??
        claimTsById.get(row.source_row_id);
      if (ts) openedAt = new Date(ts).getTime();
    }
    if (openedAt != null && Number.isFinite(closedAt) && closedAt >= openedAt) {
      const days = (closedAt - openedAt) / (1000 * 60 * 60 * 24);
      closeDeltasDays.push(days);
    }
  }

  const avgFromQontrol =
    closeDeltasDays.length > 0
      ? closeDeltasDays.reduce((a, b) => a + b, 0) / closeDeltasDays.length
      : null;
  const avgFromRework = avgDaysDefectToRework(reworkRows, defectTsMerged);
  const avgDaysToClose = avgFromQontrol ?? avgFromRework ?? null;

  return {
    defectRate,
    defectRateLabel:
      defectRatePct < 0.01 && defectRate > 0
        ? `${(defectRate * 10000).toFixed(2)} bps`
        : `${defectRatePct.toFixed(2)}%`,
    openActions,
    reworkRate,
    reworkRateLabel:
      reworkRatePct < 0.01 && reworkRate > 0
        ? `${(reworkRate * 10000).toFixed(2)} bps`
        : `${reworkRatePct.toFixed(2)}%`,
    avgDaysToClose,
    avgDaysToCloseLabel:
      avgDaysToClose == null
        ? "—"
        : avgFromQontrol != null
          ? `${avgFromQontrol.toFixed(1)} days (capture → Qontrol closure)`
          : `${avgFromRework!.toFixed(1)} days — avg. time to first rework`,
    periodNote,
  };
}

export async function fetchDashboardKpis(
  opts?: FetchDashboardKpisOpts,
): Promise<DashboardKpis> {
  if (opts?.range) {
    return fetchDashboardKpisForRange(opts.range);
  }
  return fetchDashboardKpisGlobal();
}
