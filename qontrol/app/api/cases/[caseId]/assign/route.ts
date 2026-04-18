import { NextResponse } from "next/server";

import { assignCase } from "@/lib/db/cases";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const updated = await assignCase(caseId);
    return NextResponse.json({ case: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to assign case", details: message },
      { status: 500 },
    );
  }
}
