import { NextResponse } from "next/server";

import { generateCeoReport } from "@/lib/ceo-report/report";

export const runtime = "nodejs";

export async function POST() {
  try {
    const report = await generateCeoReport();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("CEO report generate failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate CEO report", details: message },
      { status: 500 },
    );
  }
}
