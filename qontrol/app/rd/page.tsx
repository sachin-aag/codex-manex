import { RdPortfolio } from "@/components/rd/rd-portfolio";
import { listRdCases } from "@/lib/db/cases";
import {
  fetchClaimsForRd,
  fetchDefectsForRd,
  listRecentRdDecisions,
} from "@/lib/db/rd";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ filter?: string; part?: string }>;
};

export default async function RdHomePage({ searchParams }: PageProps) {
  const { filter, part } = await searchParams;

  try {
    const [cases, claims, defects, recentDecisions] = await Promise.all([
      listRdCases(),
      fetchClaimsForRd(200),
      fetchDefectsForRd(300),
      listRecentRdDecisions(10),
    ]);

    return (
      <RdPortfolio
        cases={cases}
        claims={claims}
        defects={defects}
        recentDecisions={recentDecisions}
        filter={filter ?? null}
        part={part ?? null}
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
