import { NextResponse } from "next/server";

import { closeCase } from "@/lib/db/cases";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

type CloseCaseRequest = {
  comment?: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as CloseCaseRequest;
    const updated = await closeCase(caseId, { comment: body.comment });
    return NextResponse.json({ case: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to close case", details: message },
      { status: 500 },
    );
  }
}
