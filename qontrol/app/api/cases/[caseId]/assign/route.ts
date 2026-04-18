import { NextResponse } from "next/server";

import { assignCase, connectCaseToGitHub } from "@/lib/db/cases";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const assigned = await assignCase(caseId);

    try {
      const updated = await connectCaseToGitHub(caseId);
      return NextResponse.json({ case: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({
        case: assigned,
        warning: `Case routed, but GitHub issue sync failed: ${message}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to assign case", details: message },
      { status: 500 },
    );
  }
}
