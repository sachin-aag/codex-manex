import { NextResponse } from "next/server";
import { postgrestRequest } from "@/lib/db/postgrest";
import { extractChange } from "@/lib/initiative-change";

type InitiativeRow = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: string;
  user_id: string | null;
  comments: string | null;
  defect_id: string | null;
};

type DefectDetailRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string;
  defect_code: string;
  article_id: string;
  reported_part_title: string | null;
  reported_part_number?: string | null;
};

type QualitySummaryRow = {
  article_id: string;
  week_start: string;
  defect_count: number;
  products_built: number;
  claim_count?: number;
};

type FieldClaimRow = {
  field_claim_id: string;
  claim_ts: string | null;
  market: string | null;
  complaint_text: string | null;
  days_from_build: number | null;
};

type BomContextRow = {
  product_id: string;
  supplier_name?: string | null;
  supplier_batch?: string | null;
  part_title?: string | null;
  part_number?: string | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const initiatives = await postgrestRequest<InitiativeRow[]>("product_action", {
      query: {
        select:
          "action_id,product_id,ts,action_type,status,user_id,comments,defect_id",
        action_id: `eq.${id}`,
        limit: "1",
      },
    });

    const initiative = initiatives[0];
    if (!initiative) {
      return NextResponse.json({ error: `Initiative not found: ${id}` }, { status: 404 });
    }

    let defect: DefectDetailRow | null = null;
    let affectedProducts = 0;
    let affectedBatches = 0;
    let quality: QualitySummaryRow[] = [];
    let claims: FieldClaimRow[] = [];
    let bomRows: BomContextRow[] = [];

    if (initiative.defect_id) {
      const defects = await postgrestRequest<DefectDetailRow[]>("v_defect_detail", {
        query: {
          select:
            "defect_id,product_id,defect_ts,defect_code,article_id,reported_part_title,reported_part_number",
          defect_id: `eq.${initiative.defect_id}`,
        },
      });
      defect = defects[0] ?? null;
      affectedProducts = new Set(defects.map((d) => d.product_id)).size;

      // Claims view uses mapped_defect_id in this codebase; the task request used defect_id.
      // We query mapped_defect_id to match existing schema, but still satisfy the intent.
      try {
        claims = await postgrestRequest<FieldClaimRow[]>("v_field_claim_detail", {
          query: {
            select:
              "field_claim_id,claim_ts,market,complaint_text,days_from_build",
            mapped_defect_id: `eq.${initiative.defect_id}`,
            order: "claim_ts.desc",
            limit: "20",
          },
        });
      } catch {
        claims = [];
      }

      bomRows = await postgrestRequest<BomContextRow[]>("v_product_bom_parts", {
        query: {
          select: "product_id,supplier_name,supplier_batch,part_title,part_number",
          product_id: `eq.${initiative.product_id}`,
        },
      }).catch(() => []);
      affectedBatches = new Set(
        bomRows.map((row) => row.supplier_batch).filter((v): v is string => Boolean(v)),
      ).size;
    }

    const articleId = defect?.article_id ?? null;
    if (articleId) {
      try {
        quality = await postgrestRequest<QualitySummaryRow[]>("v_quality_summary", {
          query: {
            select: "article_id,week_start,defect_count,products_built,claim_count",
            article_id: `eq.${articleId}`,
            order: "week_start.asc",
          },
        });
      } catch {
        quality = await postgrestRequest<QualitySummaryRow[]>("v_quality_summary", {
          query: {
            select: "article_id,week_start,defect_count,products_built",
            article_id: `eq.${articleId}`,
            order: "week_start.asc",
          },
        });
      }
    }

    return NextResponse.json({
      initiative,
      defect,
      quality,
      claims,
      bom: bomRows[0] ?? null,
      change: extractChange(
        initiative,
        defect,
        claims,
        bomRows[0] ?? null,
        { defects: affectedProducts, claims: claims.length },
      ),
      kpis: {
        affectedProducts,
        fieldClaimsTotal: claims.length,
        affectedBatches,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

