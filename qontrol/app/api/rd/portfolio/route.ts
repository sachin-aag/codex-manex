import { NextResponse } from "next/server";

import {
  lastNDaysRangeUtc,
  parseRangeFromSearchParams,
  utcBoundsFromDays,
  type UtcDay,
  type UtcRange,
} from "@/lib/date-range";
import { getRdPortfolioSnapshot } from "@/lib/rd-portfolio";

function toUtcRange(from: UtcDay, to: UtcDay): UtcRange {
  const { startIso, endIso } = utcBoundsFromDays(from, to);
  return { from, to, startIso, endIso };
}

export async function GET(request: Request) {
  try {
    const parsed = parseRangeFromSearchParams(
      new URL(request.url).searchParams,
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const sevenDayRange = lastNDaysRangeUtc(7);
    const effectiveRange =
      parsed.range ?? toUtcRange(sevenDayRange.from, sevenDayRange.to);
    const snapshot = await getRdPortfolioSnapshot(effectiveRange);

    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load R&D portfolio";
    return NextResponse.json(
      { error: "Failed to load R&D portfolio", details: message },
      { status: 500 },
    );
  }
}
