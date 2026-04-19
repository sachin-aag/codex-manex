import { NextResponse } from "next/server";

import { routeCase } from "@/lib/db/cases";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

type AssignRouteRequest = {
  createCombinedTicket?: boolean;
  linkedCaseIds?: string[];
  openEmailDraft?: boolean;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const body =
      request.headers.get("content-type")?.includes("application/json")
        ? ((await request.json()) as AssignRouteRequest)
        : {};
    const result = await routeCase({
      caseId,
      createCombinedTicket: body.createCombinedTicket,
      linkedCaseIds: body.linkedCaseIds,
      openEmailDraft: body.openEmailDraft,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to assign case", details: message },
      { status: 500 },
    );
  }
}
