import { RdPortfolio } from "@/components/rd/rd-portfolio";
import {
  parseRangeFromSearchParams,
  previousCalendarMonthRangeUtc,
  utcBoundsFromDays,
  type UtcDay,
  type UtcRange,
} from "@/lib/date-range";
import { getRdPortfolioSnapshot } from "@/lib/rd-portfolio";

export const dynamic = "force-dynamic";

function toUtcRange(from: UtcDay, to: UtcDay): UtcRange {
  const { startIso, endIso } = utcBoundsFromDays(from, to);
  return { from, to, startIso, endIso };
}

type PageProps = {
  searchParams: Promise<{ filter?: string; part?: string; from?: string; to?: string }>;
};

export default async function RdHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const params = new URLSearchParams();
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);

  const parsed = parseRangeFromSearchParams(params);
  if (!parsed.ok) {
    return (
      <main className="page-shell" data-dept="rd">
        <section className="hero-strip">
          <div>
            <p className="eyebrow">R&D · Design / Reliability</p>
            <h1>R&D Workspace</h1>
            <p className="hero-copy">Invalid time range in the URL.</p>
          </div>
        </section>
        <div className="card-surface panel" style={{ marginTop: 20 }}>
          <p style={{ color: "var(--danger)" }}>{parsed.error}</p>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
            Use <code className="kpi-code">from</code> and <code className="kpi-code">to</code> as{" "}
            YYYY-MM-DD, or remove both for the default (last month).
          </p>
        </div>
      </main>
    );
  }

  const previousMonth = previousCalendarMonthRangeUtc();
  const effectiveRange: UtcRange =
    parsed.range === null
      ? toUtcRange(previousMonth.from, previousMonth.to)
      : parsed.range;

  try {
    const snapshot = await getRdPortfolioSnapshot(effectiveRange);

    return (
      <RdPortfolio
        cases={snapshot.cases}
        claims={snapshot.claims}
        claimsPrevious={snapshot.claimsPrevious}
        defects={snapshot.defects}
        initiatives={snapshot.initiatives}
        recentDecisions={snapshot.recentDecisions}
        filter={sp.filter ?? null}
        part={sp.part ?? null}
        timeRange={snapshot.timeRange}
      />
    );
  } catch (err) {
    return (
      <main className="page-shell" data-dept="rd">
        <section className="hero-strip">
          <div>
            <p className="eyebrow">R&D · Design / Reliability</p>
            <h1>R&D Workspace</h1>
            <p className="hero-copy">Could not reach the Manex API.</p>
          </div>
        </section>
        <div className="rd-error">{err instanceof Error ? err.message : String(err)}</div>
      </main>
    );
  }
}
