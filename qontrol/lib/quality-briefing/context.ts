import { postgrestRequest } from "@/lib/db/postgrest";

/** Known terminal statuses for corrective actions (aligns with QM KPIs). */
const TERMINAL_ACTION_STATUSES = new Set(
  ["closed", "done", "verified"].map((s) => s.toLowerCase()),
);

const STALE_ACTION_DAYS = 14;
const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export type BriefingDefectRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string;
  defect_code: string | null;
  severity: string | null;
  article_name: string | null;
  detected_section_name: string | null;
  occurrence_section_name: string | null;
  reported_part_title: string | null;
  notes: string | null;
};

export type BriefingActionRow = {
  action_id: string;
  product_id: string;
  ts: string | null;
  action_type: string | null;
  status: string | null;
  user_id: string | null;
  defect_id: string | null;
  comments: string | null;
  age_days: number;
  is_stale: boolean;
};

export type BriefingTestFailRow = {
  test_result_id: string;
  product_id: string;
  ts: string | null;
  test_key: string | null;
  overall_result: string | null;
};

export type BriefingReworkWeek = {
  week_start: string;
  count: number;
};

export type RecurringByCode = { defect_code: string; count: number };
export type RecurringByProduct = { product_id: string; count: number };

export type BriefingContext = {
  generated_at: string;
  priority_defects: BriefingDefectRow[];
  defects_without_actions: BriefingDefectRow[];
  stale_open_actions: BriefingActionRow[];
  other_open_actions_sample: BriefingActionRow[];
  recurring_defect_codes: RecurringByCode[];
  recurring_products: RecurringByProduct[];
  inspection_failures: BriefingTestFailRow[];
  rework_by_week: BriefingReworkWeek[];
  pareto_top_codes: { defect_code: string; count: number }[];
  stats: {
    defects_sampled: number;
    actions_sampled: number;
    test_fails_sampled: number;
    rework_events_sampled: number;
  };
  data_patterns_hint: string;
};

function severityRank(s: string | null): number {
  return SEVERITY_RANK[(s ?? "").toLowerCase()] ?? 0;
}

function weekStartMondayUtc(iso: string): string {
  const d = new Date(iso);
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

function daysBetween(iso: string | null, now: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((now - t) / (1000 * 60 * 60 * 24));
}

const DATA_PATTERNS_HINT = `
Known dataset stories (use only to interpret patterns; still cite real IDs from context):
- Story 1: SOLDER_COLD + supplier batch SB-00007 / PM-00008; field claims spike Mar 2026.
- Story 2: VIB_FAIL in Dec 2025 (calibration); VIB_TEST failures same window.
- Story 3: Field claims on ART-00001 / PM-00015 with no factory defect (design leak).
- Story 4: Cosmetic defects on orders PO-00012/18/24; rework user_042.
- Detection bias: many defects detected at Pruefung Linie 2 — not necessarily root cause.
`.trim();

export async function buildBriefingContext(): Promise<BriefingContext> {
  const now = Date.now();

  const [defectRows, actionRows, testFails, reworkRows] = await Promise.all([
    postgrestRequest<BriefingDefectRow[]>("v_defect_detail", {
      query: {
        select:
          "defect_id,product_id,defect_ts,defect_code,severity,article_name,detected_section_name,occurrence_section_name,reported_part_title,notes",
        order: "defect_ts.desc",
        limit: "500",
      },
    }),
    postgrestRequest<
      {
        action_id: string;
        product_id: string;
        ts: string | null;
        action_type: string | null;
        status: string | null;
        user_id: string | null;
        defect_id: string | null;
        comments: string | null;
      }[]
    >("product_action", {
      query: {
        select:
          "action_id,product_id,ts,action_type,status,user_id,defect_id,comments",
        order: "ts.desc",
        limit: "10000",
      },
    }),
    postgrestRequest<BriefingTestFailRow[]>("test_result", {
      query: {
        select: "test_result_id,product_id,ts,test_key,overall_result",
        overall_result: "eq.FAIL",
        order: "ts.desc",
        limit: "50",
      },
    }),
    postgrestRequest<
      { rework_id: string; defect_id: string; product_id: string; ts: string | null }[]
    >("rework", {
      query: {
        select: "rework_id,defect_id,product_id,ts",
        order: "ts.desc",
        limit: "8000",
      },
    }),
  ]);

  const defectsWithAnyAction = new Set<string>();
  for (const a of actionRows) {
    if (a.defect_id) defectsWithAnyAction.add(a.defect_id);
  }

  const sortedByPriority = [...defectRows].sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      new Date(b.defect_ts).getTime() - new Date(a.defect_ts).getTime(),
  );
  const priority_defects = sortedByPriority.slice(0, 50);

  const defects_without_actions = defectRows.filter(
    (d) => !defectsWithAnyAction.has(d.defect_id),
  );

  const openActions: BriefingActionRow[] = [];
  for (const a of actionRows) {
    const st = (a.status ?? "").toLowerCase();
    if (TERMINAL_ACTION_STATUSES.has(st)) continue;
    const age = daysBetween(a.ts, now);
    const is_stale = age >= STALE_ACTION_DAYS;
    openActions.push({
      action_id: a.action_id,
      product_id: a.product_id,
      ts: a.ts,
      action_type: a.action_type,
      status: a.status,
      user_id: a.user_id,
      defect_id: a.defect_id,
      comments: a.comments,
      age_days: age,
      is_stale,
    });
  }

  const stale_open_actions = openActions
    .filter((a) => a.is_stale)
    .slice(0, 30);
  const other_open_actions_sample = openActions
    .filter((a) => !a.is_stale)
    .slice(0, 20);

  const codeCount = new Map<string, number>();
  const productCount = new Map<string, number>();
  for (const d of defectRows) {
    if (d.defect_code) {
      codeCount.set(d.defect_code, (codeCount.get(d.defect_code) ?? 0) + 1);
    }
    productCount.set(d.product_id, (productCount.get(d.product_id) ?? 0) + 1);
  }
  const recurring_defect_codes = Array.from(codeCount.entries())
    .filter(([, c]) => c >= 2)
    .map(([defect_code, count]) => ({ defect_code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  const recurring_products = Array.from(productCount.entries())
    .filter(([, c]) => c >= 2)
    .map(([product_id, count]) => ({ product_id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const weekBuckets = new Map<string, number>();
  for (const r of reworkRows) {
    if (!r.ts) continue;
    const w = weekStartMondayUtc(r.ts);
    if (!w) continue;
    weekBuckets.set(w, (weekBuckets.get(w) ?? 0) + 1);
  }
  const rework_by_week = Array.from(weekBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([week_start, count]) => ({ week_start, count }));

  const pareto_top_codes = [...codeCount.entries()]
    .map(([defect_code, count]) => ({ defect_code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    generated_at: new Date().toISOString(),
    priority_defects,
    defects_without_actions: defects_without_actions.slice(0, 40),
    stale_open_actions,
    other_open_actions_sample,
    recurring_defect_codes,
    recurring_products,
    inspection_failures: testFails,
    rework_by_week,
    pareto_top_codes,
    stats: {
      defects_sampled: defectRows.length,
      actions_sampled: actionRows.length,
      test_fails_sampled: testFails.length,
      rework_events_sampled: reworkRows.length,
    },
    data_patterns_hint: DATA_PATTERNS_HINT,
  };
}
