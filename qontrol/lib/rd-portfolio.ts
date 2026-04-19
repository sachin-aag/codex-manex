import "server-only";

import { unstable_cache } from "next/cache";

import {
  previousUtcRangeInclusive,
  type UtcRange,
} from "@/lib/date-range";
import { listRdCases } from "@/lib/db/cases";
import {
  fetchClaimsForRd,
  fetchDefectsForRd,
  fetchInitiativesForRd,
  listRecentRdDecisions,
  type ClaimLagRow,
  type DefectHistoryRow,
  type ProductActionRow,
} from "@/lib/db/rd";
import type { QontrolCase } from "@/lib/qontrol-data";

export type RdPortfolioSnapshot = {
  cases: QontrolCase[];
  claims: ClaimLagRow[];
  claimsPrevious: ClaimLagRow[];
  defects: DefectHistoryRow[];
  initiatives: ProductActionRow[];
  recentDecisions: ProductActionRow[];
  timeRange: { from: string; to: string };
};

const loadRdPortfolioSnapshot = unstable_cache(
  async (
    from: string,
    to: string,
    startIso: string,
    endIso: string,
  ): Promise<RdPortfolioSnapshot> => {
    const range: UtcRange = { from, to, startIso, endIso };
    const prevRange = previousUtcRangeInclusive(range);
    const allCases = await listRdCases();
    const cases = allCases.filter(
      (c) => c.lastUpdateAt >= startIso && c.lastUpdateAt <= endIso,
    );

    const [claims, claimsPrevious, defects, initiatives, recentDecisions] = await Promise.all([
      fetchClaimsForRd(200, range),
      fetchClaimsForRd(2000, prevRange),
      fetchDefectsForRd(300, range),
      fetchInitiativesForRd(500, range),
      listRecentRdDecisions(10, range),
    ]);

    return {
      cases,
      claims,
      claimsPrevious,
      defects,
      initiatives,
      recentDecisions,
      timeRange: { from, to },
    };
  },
  ["rd-portfolio-snapshot"],
  { revalidate: 60 },
);

export function getRdPortfolioSnapshot(range: UtcRange) {
  return loadRdPortfolioSnapshot(
    range.from,
    range.to,
    range.startIso,
    range.endIso,
  );
}
