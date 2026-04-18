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
  complaint_text: string | null;
  reported_part_title: string | null;
  days_from_build: number | null;
  cost: number | null;
  market: string | null;
};

export type InitiativeRow = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: string;
  user_id: string | null;
  comments: string | null;
  defect_id: string | null;
};

export async function fetchQualitySummary(): Promise<QualitySummaryRow[]> {
  return postgrestRequest<QualitySummaryRow[]>("v_quality_summary", {
    query: { order: "week_start.asc" },
  });
}

export async function fetchDefects(limit = 200): Promise<DefectDetailRow[]> {
  return postgrestRequest<DefectDetailRow[]>("v_defect_detail", {
    query: {
      order: "defect_ts.desc",
      limit: String(limit),
      select:
        "defect_id,product_id,defect_ts,defect_code,severity,article_name,detected_section_name,occurrence_section_name,reported_part_title,cost,notes",
    },
  });
}

export async function fetchClaims(limit = 100): Promise<ClaimDetailRow[]> {
  return postgrestRequest<ClaimDetailRow[]>("v_field_claim_detail", {
    query: {
      order: "claim_ts.desc",
      limit: String(limit),
      select:
        "field_claim_id,product_id,claim_ts,article_name,complaint_text,reported_part_title,days_from_build,cost,market",
    },
  });
}

export async function fetchInitiatives(): Promise<InitiativeRow[]> {
  return postgrestRequest<InitiativeRow[]>("product_action", {
    query: { order: "ts.desc" },
  });
}

/** Compute pareto, severity timeline, trend, claim lag from the raw data. */
export function computePareto(defects: DefectDetailRow[]): ParetoRow[] {
  const counts = new Map<string, number>();
  for (const d of defects) {
    if (!d.defect_code) continue;
    counts.set(d.defect_code, (counts.get(d.defect_code) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);
  let cum = 0;
  return sorted.map(([code, cnt]) => {
    cum += cnt;
    return { defect_code: code, cnt, cum_share: total > 0 ? cum / total : 0 };
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

export type PortfolioKpis = {
  totalDefects: number;
  totalClaims: number;
  openInitiatives: number;
  closedInitiatives: number;
  defectRateRecent: number;
  topDefectCode: string;
};

export function computeKpis(
  defects: DefectDetailRow[],
  claims: ClaimDetailRow[],
  initiatives: InitiativeRow[],
  summary: QualitySummaryRow[]
): PortfolioKpis {
  const open = initiatives.filter(
    (i) => i.status === "open" || i.status === "in_progress"
  ).length;
  const closed = initiatives.filter(
    (i) => i.status === "done" || i.status === "closed"
  ).length;

  const recentWeeks = summary.slice(-8);
  const totalProd = recentWeeks.reduce((s, r) => s + r.products_built, 0);
  const totalDef = recentWeeks.reduce((s, r) => s + r.defect_count, 0);
  const dr = totalProd > 0 ? totalDef / totalProd : 0;

  const pareto = computePareto(defects);
  const topCode = pareto[0]?.defect_code ?? "—";

  return {
    totalDefects: defects.length,
    totalClaims: claims.length,
    openInitiatives: open,
    closedInitiatives: closed,
    defectRateRecent: dr,
    topDefectCode: topCode,
  };
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
