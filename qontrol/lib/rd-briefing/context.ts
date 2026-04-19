import { listRdCases } from "@/lib/db/cases";
import type { ProductActionRow } from "@/lib/db/rd";
import {
  countFcsPerPart,
  designGapFcs,
  fetchClaimsForRd,
  fetchDefectsForRd,
  longLagFcs,
  listRecentRdDecisions,
} from "@/lib/db/rd";
import type { QontrolCase } from "@/lib/qontrol-data";

const STALE_CASE_DAYS = 14;

function daysBetween(iso: string | null, now: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((now - t) / (1000 * 60 * 60 * 24));
}

function mapCase(c: QontrolCase, now: number) {
  const age_days = daysBetween(c.lastUpdateAt, now);
  return {
    case_id: c.id,
    source_type: c.sourceType,
    state: c.state,
    story: c.story,
    severity: c.severity,
    product_id: c.productId,
    article_id: c.articleId,
    part_number: c.partNumber,
    title: c.title,
    summary: c.summary,
    owner_team: c.ownerTeam,
    assignee: c.assignee,
    last_update_at: c.lastUpdateAt,
    age_days,
    is_stale_open:
      c.state !== "closed" && age_days >= STALE_CASE_DAYS,
  };
}

const DATA_PATTERNS_HINT = `
Known R&D routing context (interpret only with IDs from context):
- R&D cases are design-story cases or owner_team R&D; case IDs are DEF-* (defect) or FC-* (field claim).
- design_decision actions log R&D outcomes (acknowledged, proposed_fix, rejected).
- Design-gap field claims: FC with no factory defect on same part (see design_gap_field_claim_ids).
- Long-lag: claims with days_from_build beyond 8 weeks (see long_lag_field_claim_ids).
`.trim();

export type RdBriefingContext = {
  generated_at: string;
  stats: {
    rd_cases_total: number;
    open_rd_cases: number;
    closed_rd_cases: number;
    stale_open_cases: number;
    claims_sampled: number;
    defects_sampled: number;
    decisions_sampled: number;
    recurring_parts_with_2plus_fc: number;
    design_gap_fcs: number;
    long_lag_fcs: number;
  };
  rd_cases: ReturnType<typeof mapCase>[];
  open_rd_cases: ReturnType<typeof mapCase>[];
  stale_open_cases: ReturnType<typeof mapCase>[];
  recent_design_decisions: {
    action_id: string;
    product_id: string;
    ts: string | null;
    status: string | null;
    defect_id: string | null;
    comments_excerpt: string | null;
  }[];
  claims_sample: {
    field_claim_id: string;
    product_id: string;
    reported_part_number: string | null;
    days_from_build: number | null;
    article_id: string;
  }[];
  defects_sample: {
    defect_id: string;
    product_id: string;
    defect_code: string | null;
    severity: string | null;
    reported_part_number: string | null;
  }[];
  recurring_parts_top: { part_number: string; count: number; articles: string[] }[];
  design_gap_field_claim_ids: string[];
  long_lag_field_claim_ids: string[];
  data_patterns_hint: string;
};

export async function buildRdBriefingContext(): Promise<RdBriefingContext> {
  const now = Date.now();

  const [cases, claims, defects, decisions] = await Promise.all([
    listRdCases(),
    fetchClaimsForRd(200),
    fetchDefectsForRd(300),
    listRecentRdDecisions(20),
  ]);

  const mapped = cases.map((c) => mapCase(c, now));
  const open = mapped.filter((c) => c.state !== "closed");
  const staleOpen = open.filter((c) => c.is_stale_open);

  const recurring = countFcsPerPart(claims);
  const multiFcParts = recurring.filter((r) => r.count >= 2);
  const gapFcs = designGapFcs(claims, defects);
  const longLag = longLagFcs(claims);

  const recent_design_decisions = decisions.map((d: ProductActionRow) => ({
    action_id: d.action_id,
    product_id: d.product_id,
    ts: d.ts,
    status: d.status,
    defect_id: d.defect_id,
    comments_excerpt:
      d.comments && d.comments.length > 200
        ? `${d.comments.slice(0, 200)}…`
        : d.comments,
  }));

  const claims_sample = claims.slice(0, 80).map((c) => ({
    field_claim_id: c.field_claim_id,
    product_id: c.product_id,
    reported_part_number: c.reported_part_number,
    days_from_build: c.days_from_build,
    article_id: c.article_id,
  }));

  const defects_sample = defects.slice(0, 80).map((d) => ({
    defect_id: d.defect_id,
    product_id: d.product_id,
    defect_code: d.defect_code,
    severity: d.severity,
    reported_part_number: d.reported_part_number,
  }));

  return {
    generated_at: new Date().toISOString(),
    stats: {
      rd_cases_total: mapped.length,
      open_rd_cases: open.length,
      closed_rd_cases: mapped.filter((c) => c.state === "closed").length,
      stale_open_cases: staleOpen.length,
      claims_sampled: claims.length,
      defects_sampled: defects.length,
      decisions_sampled: decisions.length,
      recurring_parts_with_2plus_fc: multiFcParts.length,
      design_gap_fcs: gapFcs.length,
      long_lag_fcs: longLag.length,
    },
    rd_cases: mapped,
    open_rd_cases: open,
    stale_open_cases: staleOpen,
    recent_design_decisions,
    claims_sample,
    defects_sample,
    recurring_parts_top: multiFcParts.slice(0, 12).map((r) => ({
      part_number: r.part_number,
      count: r.count,
      articles: r.articles.slice(0, 5),
    })),
    design_gap_field_claim_ids: gapFcs.slice(0, 30).map((c) => c.field_claim_id),
    long_lag_field_claim_ids: longLag.slice(0, 30).map((c) => c.field_claim_id),
    data_patterns_hint: DATA_PATTERNS_HINT,
  };
}
