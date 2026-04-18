import { NextResponse } from "next/server";

import { connectCaseToGitHub } from "@/lib/db/cases";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const updated = await connectCaseToGitHub(caseId);
    return NextResponse.json({ case: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to connect GitHub issue", details: message },
      { status: 500 },
    );
  }
}
