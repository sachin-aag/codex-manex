import "server-only";

import { unstable_cache } from "next/cache";

import type { UtcRange } from "@/lib/date-range";
import { listRdCases } from "@/lib/db/cases";
import {
  fetchClaimsForRd,
  fetchDefectsForRd,
  listRecentRdDecisions,
  type ClaimLagRow,
  type DefectHistoryRow,
  type ProductActionRow,
} from "@/lib/db/rd";
import type { QontrolCase } from "@/lib/qontrol-data";

export type RdPortfolioSnapshot = {
  cases: QontrolCase[];
  claims: ClaimLagRow[];
  defects: DefectHistoryRow[];
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
    const allCases = await listRdCases();
    const cases = allCases.filter(
      (c) => c.lastUpdateAt >= startIso && c.lastUpdateAt <= endIso,
    );

    const [claims, defects, recentDecisions] = await Promise.all([
      fetchClaimsForRd(200, range),
      fetchDefectsForRd(300, range),
      listRecentRdDecisions(10, range),
    ]);

    return {
      cases,
      claims,
      defects,
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
