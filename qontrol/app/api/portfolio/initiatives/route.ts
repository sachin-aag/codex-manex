import { NextResponse } from "next/server";
import { fetchInitiatives } from "@/lib/portfolio-data";
import { postgrestRequest } from "@/lib/db/postgrest";
import { extractChange, type InitiativeChange } from "@/lib/initiative-change";

type CreateInitiativeBody = {
  defectId?: string;
  type?: string;
  comment?: string;
};

type DefectLookupRow = {
  product_id: string;
};

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

type DefectContextRow = {
  defect_id: string;
  product_id: string;
  defect_code: string | null;
  reported_part_title: string | null;
  reported_part_number: string | null;
};

type ClaimContextRow = {
  field_claim_id: string;
};

type BomContextRow = {
  product_id: string;
  supplier_name?: string | null;
  supplier_batch?: string | null;
  part_title?: string | null;
  part_number?: string | null;
};

type InitiativeListItem = InitiativeRow & {
  change: InitiativeChange;
};

type ProductActionInsertRow = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: string;
  user_id: string;
  section_id: string | null;
  comments: string;
  defect_id: string;
};

async function lookupProductId(defectId: string) {
  const rows = await postgrestRequest<DefectLookupRow[]>("v_defect_detail", {
    query: {
      select: "product_id",
      defect_id: `eq.${defectId}`,
      limit: "1",
    },
  });
  return rows[0]?.product_id ?? null;
}

async function createInitiative(payload: Omit<ProductActionInsertRow, "action_id">) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actionId = `PA-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    try {
      const rows = await postgrestRequest<ProductActionInsertRow[]>("product_action", {
        method: "POST",
        body: { action_id: actionId, ...payload },
        prefer: "return=representation",
      });
      return rows[0];
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("duplicate key value violates unique constraint")
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate unique product_action id after retries.");
}

export async function GET() {
  try {
    const initiatives = await fetchInitiatives();

    const enriched: InitiativeListItem[] = await Promise.all(
      initiatives.map(async (initiative) => {
        if (!initiative.defect_id) {
          return {
            ...initiative,
            change: extractChange(
              initiative,
              null,
              [],
              null,
              { defects: 0, claims: 0 },
            ),
          };
        }

        const [defects, claims, bomRows] = await Promise.all([
          postgrestRequest<DefectContextRow[]>("v_defect_detail", {
            query: {
              select:
                "defect_id,product_id,defect_code,reported_part_title,reported_part_number",
              defect_id: `eq.${initiative.defect_id}`,
            },
          }),
          postgrestRequest<ClaimContextRow[]>("v_field_claim_detail", {
            query: {
              select: "field_claim_id",
              mapped_defect_id: `eq.${initiative.defect_id}`,
            },
          }).catch(() => []),
          postgrestRequest<BomContextRow[]>("v_product_bom_parts", {
            query: {
              select: "product_id,supplier_name,supplier_batch,part_title,part_number",
              product_id: `eq.${initiative.product_id}`,
              limit: "1",
            },
          }).catch(() => []),
        ]);

        const defect = defects[0] ?? null;
        const bom = bomRows[0] ?? null;

        return {
          ...initiative,
          change: extractChange(
            initiative,
            defect,
            claims,
            bom,
            { defects: defects.length, claims: claims.length },
          ),
        };
      }),
    );

    return NextResponse.json(enriched);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateInitiativeBody;
    const defectId = body.defectId?.trim();
    const type = body.type?.trim();
    const comment = body.comment?.trim();

    if (!defectId || !type || !comment) {
      return NextResponse.json(
        { error: "Defect-ID, Type und Comment sind erforderlich." },
        { status: 400 },
      );
    }

    const productId = await lookupProductId(defectId);
    if (!productId) {
      return NextResponse.json(
        { error: `Keine passende Defect-ID gefunden: ${defectId}` },
        { status: 404 },
      );
    }

    const created = await createInitiative({
      product_id: productId,
      ts: new Date().toISOString(),
      action_type: type,
      status: "open",
      user_id: "qontrol",
      section_id: null,
      comments: comment,
      defect_id: defectId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
