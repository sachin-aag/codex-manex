import { NextResponse } from "next/server";

import { closeCase } from "@/lib/db/cases";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const updated = await closeCase(caseId);
    return NextResponse.json({ case: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to close case", details: message },
      { status: 500 },
    );
  }
}
