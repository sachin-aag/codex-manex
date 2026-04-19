import type { DashboardKpis } from "@/lib/db/kpis";
import { previousCalendarMonthRangeUtc } from "@/lib/date-range";
import type {
  BatchRankingRow,
  ClaimLagRow,
  ClaimScatterPoint,
  CostBreakdownData,
  ParetoRow,
  SectionHeatmapData,
  SeverityStackRow,
  SeverityTotals,
  WeeklyTrendPoint,
} from "@/lib/portfolio-data";

export type PortfolioRange = {
  from: string;
  to: string;
};

export type PortfolioPayload = {
  range?: { from: string; to: string } | null;
  pareto: ParetoRow[];
  weeklyRollup: WeeklyTrendPoint[];
  claimLag: ClaimLagRow[];
  sectionHeatmap: SectionHeatmapData;
  severityByOccurrence: SeverityStackRow[];
  costBreakdown: CostBreakdownData;
  claimScatter: ClaimScatterPoint[];
  bomBatchRanking: BatchRankingRow[];
  severityTotals?: SeverityTotals;
};

export type PortfolioBundle = {
  portfolio: PortfolioPayload;
  kpis: DashboardKpis;
  fetchedAt: number;
};

type CacheEntry = {
  data?: PortfolioBundle;
  promise?: Promise<PortfolioBundle>;
};

const CACHE_TTL_MS = 60_000;

export const DEFAULT_PORTFOLIO_RANGE: PortfolioRange =
  previousCalendarMonthRangeUtc();

const portfolioCache = new Map<string, CacheEntry>();

function getRangeKey(range: PortfolioRange) {
  return `${range.from}:${range.to}`;
}

function getRangeQueryString(range: PortfolioRange) {
  return `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

async function fetchPortfolioBundle(range: PortfolioRange): Promise<PortfolioBundle> {
  const qs = getRangeQueryString(range);
  const [resPortfolio, resKpis] = await Promise.all([
    fetch(`/api/portfolio?${qs}`),
    fetch(`/api/cases/kpis?${qs}`),
  ]);

  if (!resPortfolio.ok) {
    const payload = await resPortfolio.json().catch(() => ({}));
    throw new Error(payload.error ?? payload.details ?? "Failed to load portfolio");
  }

  if (!resKpis.ok) {
    const payload = await resKpis.json().catch(() => ({}));
    throw new Error(payload.error ?? payload.details ?? "Failed to load KPIs");
  }

  const [portfolio, kpis] = await Promise.all([
    resPortfolio.json() as Promise<PortfolioPayload>,
    resKpis.json() as Promise<DashboardKpis>,
  ]);

  return {
    portfolio,
    kpis,
    fetchedAt: Date.now(),
  };
}

function startPortfolioLoad(range: PortfolioRange) {
  const key = getRangeKey(range);
  const existing = portfolioCache.get(key);
  if (existing?.promise) {
    return existing.promise;
  }

  const promise = fetchPortfolioBundle(range)
    .then((bundle) => {
      portfolioCache.set(key, { data: bundle });
      return bundle;
    })
    .catch((error) => {
      portfolioCache.delete(key);
      throw error;
    });

  portfolioCache.set(key, { data: existing?.data, promise });
  return promise;
}

export function getCachedPortfolioBundle(range: PortfolioRange): PortfolioBundle | null {
  return portfolioCache.get(getRangeKey(range))?.data ?? null;
}

export function isPortfolioBundleFresh(
  range: PortfolioRange,
  maxAgeMs = CACHE_TTL_MS,
) {
  const cached = getCachedPortfolioBundle(range);
  return cached != null && Date.now() - cached.fetchedAt <= maxAgeMs;
}

export function loadPortfolioBundle(
  range: PortfolioRange,
  options?: { force?: boolean },
) {
  const cached = getCachedPortfolioBundle(range);
  if (!options?.force && cached && isPortfolioBundleFresh(range)) {
    return Promise.resolve(cached);
  }

  return startPortfolioLoad(range);
}

export function preloadPortfolioBundle(range: PortfolioRange = DEFAULT_PORTFOLIO_RANGE) {
  return loadPortfolioBundle(range);
}
