import { NextResponse } from "next/server";

import { fetchDashboardKpis } from "@/lib/db/kpis";
import { parseRangeFromSearchParams } from "@/lib/date-range";

export async function GET(request: Request) {
  try {
    const parsed = parseRangeFromSearchParams(
      new URL(request.url).searchParams,
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const kpis = await fetchDashboardKpis(
      parsed.range ? { range: parsed.range } : undefined,
    );
    return NextResponse.json(kpis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load KPIs", details: message },
      { status: 500 },
    );
  }
}
