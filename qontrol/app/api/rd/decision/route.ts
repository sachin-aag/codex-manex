import { NextResponse } from "next/server";

import { submitRdDecision, type RdDecisionPayload } from "@/lib/db/cases";

export const runtime = "nodejs";

type Body = {
  caseId?: string;
  outcome?: RdDecisionPayload["outcome"];
  classification?: RdDecisionPayload["classification"];
  proposedFixType?: RdDecisionPayload["proposedFixType"];
  recallScope?: string[];
  note?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.caseId) {
    return NextResponse.json({ error: "caseId is required." }, { status: 400 });
  }
  if (!body.outcome) {
    return NextResponse.json({ error: "outcome is required." }, { status: 400 });
  }
  if (!body.note || !body.note.trim()) {
    return NextResponse.json({ error: "note is required." }, { status: 400 });
  }

  try {
    const updated = await submitRdDecision(body.caseId, {
      outcome: body.outcome,
      classification: body.classification,
      proposedFixType: body.proposedFixType,
      recallScope: body.recallScope ?? [],
      note: body.note,
    });
    return NextResponse.json({ ok: true, case: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
