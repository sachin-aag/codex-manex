/** ISO calendar date YYYY-MM-DD (UTC interpretation). */
export type UtcDay = string;

export type UtcRange = { from: UtcDay; to: UtcDay; startIso: string; endIso: string };

export type ParseRangeResult =
  | { ok: true; range: null }
  | { ok: true; range: UtcRange }
  | { ok: false; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const t = Date.UTC(
    Number(s.slice(0, 4)),
    Number(s.slice(5, 7)) - 1,
    Number(s.slice(8, 10)),
  );
  return !Number.isNaN(t);
}

/** Inclusive UTC day bounds as ISO strings for timestamptz columns. */
export function utcBoundsFromDays(from: UtcDay, to: UtcDay): { startIso: string; endIso: string } {
  return {
    startIso: `${from}T00:00:00.000Z`,
    endIso: `${to}T23:59:59.999Z`,
  };
}

/**
 * Parse `from` / `to` from URL search params. Both required together; empty = no filter (all data).
 */
export function parseRangeFromSearchParams(
  searchParams: URLSearchParams,
): ParseRangeResult {
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  if (from === "" && to === "") {
    return { ok: true, range: null };
  }
  if (from === "" || to === "") {
    return { ok: false, error: "Provide both from and to (YYYY-MM-DD), or neither for all data." };
  }
  if (!isValidYmd(from) || !isValidYmd(to)) {
    return { ok: false, error: "Invalid date format. Use YYYY-MM-DD." };
  }
  if (from > to) {
    return { ok: false, error: "from must be on or before to." };
  }
  const { startIso, endIso } = utcBoundsFromDays(from, to);
  return { ok: true, range: { from, to, startIso, endIso } };
}

/** PostgREST: `col=gte.x&col=lte.y` — duplicate keys AND. Values use gte./lte. prefix. */
export function timestampRangeAppend(column: string, startIso: string, endIso: string): [string, string][] {
  return [
    [column, `gte.${startIso}`],
    [column, `lte.${endIso}`],
  ];
}

/** For date columns like week_start (YYYY-MM-DD strings). */
export function dateRangeAppend(column: string, fromDay: UtcDay, toDay: UtcDay): [string, string][] {
  return [
    [column, `gte.${fromDay}`],
    [column, `lte.${toDay}`],
  ];
}

/** Today as UTC YYYY-MM-DD. */
export function utcTodayYmd(): UtcDay {
  return new Date().toISOString().slice(0, 10);
}

/** Start of current UTC year YYYY-MM-DD. */
export function utcYearStartYmd(): UtcDay {
  const y = new Date().getUTCFullYear();
  return `${y}-01-01`;
}

/** Last `weeks` × 7 UTC days ending today (inclusive). */
export function lastNWeeksRangeUtc(weeks: number): { from: UtcDay; to: UtcDay } {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setUTCDate(from.getUTCDate() - weeks * 7);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function yearToDateRangeUtc(): { from: UtcDay; to: UtcDay } {
  return { from: utcYearStartYmd(), to: utcTodayYmd() };
}

/** Last `days` UTC calendar days ending today (inclusive). */
export function lastNDaysRangeUtc(days: number): { from: UtcDay; to: UtcDay } {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** Previous UTC calendar month (first through last day). */
export function previousCalendarMonthRangeUtc(): { from: UtcDay; to: UtcDay } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const firstThisMonth = new Date(Date.UTC(y, m, 1));
  const lastPrev = new Date(firstThisMonth.getTime() - 86_400_000);
  const firstPrev = new Date(
    Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1),
  );
  return {
    from: firstPrev.toISOString().slice(0, 10),
    to: lastPrev.toISOString().slice(0, 10),
  };
}

/** From the first day of the UTC month five months before the current month through today (six month headers). */
export function lastSixMonthsToDateRangeUtc(): { from: UtcDay; to: UtcDay } {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
  );
  return {
    from: d.toISOString().slice(0, 10),
    to: utcTodayYmd(),
  };
}

function utcYmdToMs(ymd: UtcDay): number {
  return Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
  );
}

/** Whole UTC calendar days from `from` to `to` (negative if from > to). */
export function utcCalendarDaysBetween(from: UtcDay, to: UtcDay): number {
  return Math.round((utcYmdToMs(to) - utcYmdToMs(from)) / 86_400_000);
}

/** Add signed UTC calendar days to `ymd`. */
export function utcAddDays(ymd: UtcDay, days: number): UtcDay {
  const d = new Date(utcYmdToMs(ymd) + days * 86_400_000);
  return d.toISOString().slice(0, 10) as UtcDay;
}

/** Clamp a UTC day to an inclusive [min, max] range (strings compare lexicographically for YYYY-MM-DD). */
export function utcClampYmd(day: UtcDay, min: UtcDay, max: UtcDay): UtcDay {
  if (day < min) return min;
  if (day > max) return max;
  return day;
}

/**
 * Lower bound for portfolio time-slider: Jan 1 UTC of the year three years before the current UTC year.
 */
export function utcPortfolioTimelineDomainMin(): UtcDay {
  const y = new Date().getUTCFullYear() - 3;
  return `${y}-01-01`;
}
