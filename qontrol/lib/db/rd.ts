import type { UtcRange } from "@/lib/date-range";
import { timestampRangeAppend } from "@/lib/date-range";
import { postgrestRequest } from "@/lib/db/postgrest";

// ---- Raw row types ----

export type DefectHistoryRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string;
  defect_code: string | null;
  severity: string | null;
  reported_part_number: string | null;
  article_id: string;
  article_name: string | null;
  notes: string | null;
};

export type ClaimLagRow = {
  field_claim_id: string;
  product_id: string;
  claim_ts: string;
  days_from_build: number | null;
  market: string | null;
  reported_part_number: string | null;
  complaint_text: string | null;
  article_id: string;
  article_name: string | null;
};

export type BomPartRow = {
  product_id: string;
  find_number: string | null;
  bom_node_id: string | null;
  part_number: string | null;
  part_title: string | null;
  batch_id: string | null;
  batch_number: string | null;
  supplier_name: string | null;
  installed_ts: string | null;
};

export type SupplierBatchRow = {
  batch_id: string;
  part_number: string;
  batch_number: string;
  supplier_name: string;
  supplier_id: string;
  received_date: string;
  qty: number;
};

export type ProductActionRow = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: string;
  user_id: string | null;
  section_id: string | null;
  comments: string | null;
  defect_id: string | null;
};

// ---- Bulk fetchers for portfolio signals (include all fields R&D needs) ----

export async function fetchDefectsForRd(
  limit = 300,
  range?: UtcRange | null,
): Promise<DefectHistoryRow[]> {
  const effectiveLimit = range ? Math.max(limit, 2000) : limit;
  const queryAppend = range
    ? timestampRangeAppend("defect_ts", range.startIso, range.endIso)
    : undefined;
  return postgrestRequest<DefectHistoryRow[]>("v_defect_detail", {
    query: {
      select:
        "defect_id,product_id,defect_ts,defect_code,severity,reported_part_number,article_id,article_name,notes",
      order: "defect_ts.desc",
      limit: String(effectiveLimit),
    },
    queryAppend,
  });
}

export async function fetchClaimsForRd(
  limit = 200,
  range?: UtcRange | null,
): Promise<ClaimLagRow[]> {
  const effectiveLimit = range ? Math.max(limit, 2000) : limit;
  const queryAppend = range
    ? timestampRangeAppend("claim_ts", range.startIso, range.endIso)
    : undefined;
  return postgrestRequest<ClaimLagRow[]>("v_field_claim_detail", {
    query: {
      select:
        "field_claim_id,product_id,claim_ts,days_from_build,market,reported_part_number,complaint_text,article_id,article_name",
      order: "claim_ts.desc",
      limit: String(effectiveLimit),
    },
    queryAppend,
  });
}

// ---- Evidence readers (all anchored on part + product) ----

export async function getInFactoryHistoryForPart(
  partNumber: string,
  opts: { limit?: number } = {},
): Promise<DefectHistoryRow[]> {
  if (!partNumber) return [];
  return postgrestRequest<DefectHistoryRow[]>("v_defect_detail", {
    query: {
      reported_part_number: `eq.${partNumber}`,
      select:
        "defect_id,product_id,defect_ts,defect_code,severity,reported_part_number,article_id,article_name,notes",
      order: "defect_ts.desc",
      limit: String(opts.limit ?? 20),
    },
  });
}

export async function getClaimLagForPart(
  partNumber: string,
): Promise<ClaimLagRow[]> {
  if (!partNumber) return [];
  return postgrestRequest<ClaimLagRow[]>("v_field_claim_detail", {
    query: {
      reported_part_number: `eq.${partNumber}`,
      select:
        "field_claim_id,product_id,claim_ts,days_from_build,market,reported_part_number,complaint_text,article_id,article_name",
      order: "claim_ts.desc",
      limit: "60",
    },
  });
}

export async function getBomForProductAndPart(
  productId: string,
  partNumber: string,
): Promise<BomPartRow[]> {
  if (!productId || !partNumber) return [];
  return postgrestRequest<BomPartRow[]>("v_product_bom_parts", {
    query: {
      product_id: `eq.${productId}`,
      part_number: `eq.${partNumber}`,
      select:
        "product_id,find_number,bom_node_id,part_number,part_title,batch_id,batch_number,supplier_name,installed_ts",
      limit: "5",
    },
  });
}

export async function getSupplierBatch(
  batchId: string,
): Promise<SupplierBatchRow | null> {
  if (!batchId) return null;
  const rows = await postgrestRequest<SupplierBatchRow[]>("supplier_batch", {
    query: { batch_id: `eq.${batchId}`, limit: "1" },
  });
  return rows[0] ?? null;
}

type BomProductHit = { product_id: string; find_number: string | null };
type ProductRow = { product_id: string; article_id: string };
type ArticleRow = { article_id: string; name: string | null };

export async function getCrossArticleBomExposure(
  partNumber: string,
): Promise<{ article_id: string; article_name: string | null; occurrences: number; find_numbers: string[] }[]> {
  if (!partNumber) return [];

  const bomHits = await postgrestRequest<BomProductHit[]>("v_product_bom_parts", {
    query: {
      part_number: `eq.${partNumber}`,
      select: "product_id,find_number",
      limit: "500",
    },
  });
  if (bomHits.length === 0) return [];

  const productIds = Array.from(new Set(bomHits.map((r) => r.product_id)));
  const products = await postgrestRequest<ProductRow[]>("product", {
    query: {
      product_id: `in.(${productIds.join(",")})`,
      select: "product_id,article_id",
      limit: String(productIds.length),
    },
  });
  const productToArticle = new Map(products.map((p) => [p.product_id, p.article_id]));

  const articleIds = Array.from(new Set(products.map((p) => p.article_id).filter(Boolean)));
  const articles = articleIds.length
    ? await postgrestRequest<ArticleRow[]>("article", {
        query: {
          article_id: `in.(${articleIds.join(",")})`,
          select: "article_id,name",
          limit: String(articleIds.length),
        },
      })
    : [];
  const articleName = new Map(articles.map((a) => [a.article_id, a.name]));

  const byArticle = new Map<
    string,
    { article_id: string; article_name: string | null; occurrences: number; find_numbers: Set<string> }
  >();
  for (const hit of bomHits) {
    const articleId = productToArticle.get(hit.product_id);
    if (!articleId) continue;
    const cur =
      byArticle.get(articleId) ??
      {
        article_id: articleId,
        article_name: articleName.get(articleId) ?? null,
        occurrences: 0,
        find_numbers: new Set<string>(),
      };
    cur.occurrences += 1;
    if (hit.find_number) cur.find_numbers.add(hit.find_number);
    byArticle.set(articleId, cur);
  }
  return Array.from(byArticle.values())
    .map((v) => ({
      article_id: v.article_id,
      article_name: v.article_name,
      occurrences: v.occurrences,
      find_numbers: Array.from(v.find_numbers).sort(),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

// ---- Portfolio signal derivations (pure) ----

export type RecurringPart = {
  part_number: string;
  count: number;
  articles: string[];
  fcIds: string[];
};

export function countFcsPerPart(claims: ClaimLagRow[]): RecurringPart[] {
  const map = new Map<string, RecurringPart>();
  for (const c of claims) {
    const pn = c.reported_part_number;
    if (!pn) continue;
    const cur =
      map.get(pn) ?? { part_number: pn, count: 0, articles: [], fcIds: [] };
    cur.count += 1;
    if (c.article_name && !cur.articles.includes(c.article_name)) cur.articles.push(c.article_name);
    cur.fcIds.push(c.field_claim_id);
    map.set(pn, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function longLagFcs(claims: ClaimLagRow[], thresholdWeeks = 8): ClaimLagRow[] {
  const threshold = thresholdWeeks * 7;
  return claims.filter((c) => (c.days_from_build ?? 0) > threshold);
}

export function designGapFcs(
  claims: ClaimLagRow[],
  defects: DefectHistoryRow[],
): ClaimLagRow[] {
  const partsWithFactoryDefects = new Set(
    defects.map((d) => d.reported_part_number).filter((v): v is string => !!v),
  );
  return claims.filter(
    (c) => c.reported_part_number && !partsWithFactoryDefects.has(c.reported_part_number),
  );
}

export function lagDistribution(claims: ClaimLagRow[]): { bucket: string; count: number; fcIds: string[] }[] {
  const buckets = [
    { bucket: "0-4 wk", min: 0, max: 28 },
    { bucket: "4-8 wk", min: 28, max: 56 },
    { bucket: "8-12 wk", min: 56, max: 84 },
    { bucket: "12+ wk", min: 84, max: Infinity },
  ];
  return buckets.map((b) => {
    const hits = claims.filter((c) => {
      const d = c.days_from_build ?? -1;
      return d >= b.min && d < b.max;
    });
    return { bucket: b.bucket, count: hits.length, fcIds: hits.map((c) => c.field_claim_id) };
  });
}

// ---- R&D decisions feed (for portfolio "recent decisions" panel) ----

export async function listRecentRdDecisions(
  limit = 10,
  range?: UtcRange | null,
): Promise<ProductActionRow[]> {
  const queryAppend = range
    ? timestampRangeAppend("ts", range.startIso, range.endIso)
    : undefined;
  return postgrestRequest<ProductActionRow[]>("product_action", {
    query: {
      action_type: "eq.design_decision",
      order: "ts.desc",
      limit: String(limit),
    },
    queryAppend,
  });
}

export async function listRdDecisionsForCase(caseId: string): Promise<ProductActionRow[]> {
  return postgrestRequest<ProductActionRow[]>("product_action", {
    query: {
      action_type: "eq.design_decision",
      or: `(defect_id.eq.${caseId},comments.ilike.*${caseId}*)`,
      order: "ts.desc",
      limit: "20",
    },
  });
}
