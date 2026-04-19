import { NextResponse } from "next/server";

import { backfillGitHubDiscussionSummaries, listCases } from "@/lib/db/cases";

export async function POST() {
  try {
    const result = await backfillGitHubDiscussionSummaries();
    const cases = await listCases();
    return NextResponse.json({
      cases,
      syncedIssueCount: result.syncedIssueCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to backfill GitHub discussion summaries", details: message },
      { status: 500 },
    );
  }
}
