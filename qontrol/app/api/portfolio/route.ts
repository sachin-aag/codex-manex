import { NextResponse } from "next/server";

import {
  parseRangeFromSearchParams,
  type UtcRange,
} from "@/lib/date-range";
import {
  computeBomBatchRanking,
  computeClaimLag,
  computeClaimScatter,
  computeCostBreakdown,
  computeDefectTrend,
  computePareto,
  computeSectionHeatmap,
  computeSeverityByOccurrence,
  computeSeverityTimeline,
  computeSeverityTotals,
  computeWeeklyRollup,
  detectLearnings,
  fetchBomParts,
  fetchClaims,
  fetchDefects,
  fetchProductIds,
  fetchQualitySummary,
  fetchRework,
  type BomPartRow,
  type ReworkRow,
} from "@/lib/portfolio-data";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  try {
    const parsed = parseRangeFromSearchParams(
      new URL(request.url).searchParams,
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const range: UtcRange | null = parsed.range;

    const [defects, claims, summary, bom, rework, productIds] =
      await Promise.all([
        fetchDefects(2000, range),
        fetchClaims(50_000, range),
        fetchQualitySummary(range),
        safe(() => fetchBomParts(8000), [] as BomPartRow[]),
        safe(() => fetchRework(10_000, range), [] as ReworkRow[]),
        safe(() => fetchProductIds(), [] as string[]),
      ]);
    const severityTotals = computeSeverityTotals(defects);
    const pareto = computePareto(defects);
    const severityTimeline = computeSeverityTimeline(defects);
    const defectTrend = computeDefectTrend(summary);
    const weeklyRollup = computeWeeklyRollup(summary, claims);
    const claimLag = computeClaimLag(claims);
    const learnings = detectLearnings(defects, claims);
    const sectionHeatmap = computeSectionHeatmap(defects);
    const severityByOccurrence = computeSeverityByOccurrence(defects);
    const costBreakdown = computeCostBreakdown(defects, claims, rework);
    const claimScatter = computeClaimScatter(claims);
    const bomBatchRanking = computeBomBatchRanking(bom, defects);

    return NextResponse.json({
      pareto,
      severityTimeline,
      defectTrend,
      weeklyRollup,
      claimLag,
      learnings,
      sectionHeatmap,
      severityByOccurrence,
      severityTotals,
      costBreakdown,
      claimScatter,
      bomBatchRanking,
      range: range
        ? { from: range.from, to: range.to }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
