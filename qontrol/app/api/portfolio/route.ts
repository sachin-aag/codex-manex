import { NextResponse } from "next/server";
import {
  computeClaimLag,
  computeDefectTrend,
  computeKpis,
  computePareto,
  computeSeverityTimeline,
  detectLearnings,
  fetchClaims,
  fetchDefects,
  fetchInitiatives,
  fetchQualitySummary,
} from "@/lib/portfolio-data";

export async function GET() {
  try {
    const [defects, claims, initiatives, summary] = await Promise.all([
      fetchDefects(500),
      fetchClaims(200),
      fetchInitiatives(),
      fetchQualitySummary(),
    ]);

    const kpis = computeKpis(defects, claims, initiatives, summary);
    const pareto = computePareto(defects);
    const severityTimeline = computeSeverityTimeline(defects);
    const defectTrend = computeDefectTrend(summary);
    const claimLag = computeClaimLag(claims);
    const learnings = detectLearnings(defects, claims);

    const backlog = {
      open: initiatives.filter(
        (i) => i.status === "open" || i.status === "in_progress"
      ).length,
      done: initiatives.filter(
        (i) => i.status === "done" || i.status === "closed"
      ).length,
      total: initiatives.length,
    };

    return NextResponse.json({
      kpis,
      pareto,
      severityTimeline,
      defectTrend,
      claimLag,
      learnings,
      backlog,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
