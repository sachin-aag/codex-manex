import { NextResponse } from "next/server";

import { getCeoReport } from "@/lib/ceo-report/report";

export const runtime = "nodejs";

export async function GET() {
  try {
    const report = await getCeoReport();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("CEO report GET failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load CEO report", details: message },
      { status: 500 },
    );
  }
}
