"use client";

import { useEffect, useState } from "react";
import type {
  ClaimLagRow,
  DefectTrendRow,
  LearningSignal,
  ParetoRow,
  PortfolioKpis,
  SeverityWeekRow,
} from "@/lib/portfolio-data";
import Link from "next/link";

type Backlog = { open: number; done: number; total: number };

type PortfolioData = {
  kpis: PortfolioKpis;
  pareto: ParetoRow[];
  severityTimeline: SeverityWeekRow[];
  defectTrend: DefectTrendRow[];
  claimLag: ClaimLagRow[];
  learnings: LearningSignal[];
  backlog: Backlog;
};

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (err) {
    return (
      <main className="page-shell">
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)" }}>{err}</p>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
            Check that <code>MANEX_API_URL</code> and <code>MANEX_API_KEY</code> are set in <code>.env.local</code>.
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page-shell">
        <section className="hero-strip">
          <div>
            <p className="eyebrow">QM Portfolio</p>
            <h1>Loading portfolio data…</h1>
          </div>
        </section>
        <div className="pf-loading-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pf-skeleton" />
          ))}
        </div>
      </main>
    );
  }

  const { kpis, pareto, severityTimeline, defectTrend, claimLag, learnings, backlog } = data;

  return (
    <main className="page-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">QM Portfolio</p>
          <h1>Quality Engineering — management view</h1>
          <p className="hero-copy">
            Defects (D) and field claims (FC) in one place. Automated learnings from
            root-cause stories, initiative tracking, and performance improvement signals.
          </p>
        </div>
        <div className="hero-stats">
          <KpiTile label="Defects (total)" value={String(kpis.totalDefects)} />
          <KpiTile label="Claims (total)" value={String(kpis.totalClaims)} />
          <KpiTile label="Defect rate (recent)" value={kpis.defectRateRecent.toFixed(3)} />
          <KpiTile label="Open initiatives" value={String(kpis.openInitiatives)} />
          <KpiTile label="Closed initiatives" value={String(kpis.closedInitiatives)} />
          <KpiTile label="Top defect code" value={kpis.topDefectCode} />
        </div>
      </section>

      {/* Learnings */}
      <section className="pf-section">
        <div className="panel-header">
          <div>
            <h2>Active learnings</h2>
            <p>Automated signals from the four seeded root-cause stories.</p>
          </div>
          <Link href="/portfolio/learnings" className="secondary-button" style={{ textDecoration: "none" }}>
            View all →
          </Link>
        </div>
        <div className="pf-learnings-grid">
          {learnings.map((s) => (
            <LearningCard key={s.id} signal={s} />
          ))}
          {learnings.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No signals detected.</p>
          ) : null}
        </div>
      </section>

      {/* Charts grid */}
      <section className="pf-section">
        <div className="panel-header">
          <div>
            <h2>Monitors</h2>
            <p>Pareto, trends, severity mix, claim lag, and initiative backlog.</p>
          </div>
        </div>
        <div className="pf-charts-grid">
          {/* Pareto */}
          <div className="card-surface panel">
            <h3>Defect code Pareto</h3>
            <div className="pf-bar-chart">
              {pareto.slice(0, 10).map((r) => (
                <div className="pf-bar-row" key={r.defect_code}>
                  <span className="pf-bar-label">{r.defect_code}</span>
                  <div className="pf-bar-track">
                    <div
                      className="pf-bar-fill"
                      style={{ width: `${(r.cnt / (pareto[0]?.cnt || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="pf-bar-value">{r.cnt}</span>
                  <span className="pf-bar-cum">{(r.cum_share * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Defect trend */}
          <div className="card-surface panel">
            <h3>Defect rate by article (trend)</h3>
            <TrendTable data={defectTrend} />
          </div>

          {/* Severity timeline */}
          <div className="card-surface panel">
            <h3>Severity distribution by week</h3>
            <SeverityTable data={severityTimeline} />
          </div>

          {/* Claim lag */}
          <div className="card-surface panel">
            <h3>Field claim lag (days from build)</h3>
            <div className="pf-bar-chart">
              {claimLag.map((r) => (
                <div className="pf-bar-row" key={r.bucket}>
                  <span className="pf-bar-label">{r.bucket}</span>
                  <div className="pf-bar-track">
                    <div
                      className="pf-bar-fill pf-bar-teal"
                      style={{
                        width: `${(r.cnt / Math.max(...claimLag.map((x) => x.cnt), 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="pf-bar-value">{r.cnt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Initiative backlog */}
          <div className="card-surface panel">
            <h3>Initiative backlog</h3>
            <div className="pf-backlog-grid">
              <div className="metric-block">
                <span>Open</span>
                <strong>{backlog.open}</strong>
              </div>
              <div className="metric-block">
                <span>Done / closed</span>
                <strong>{backlog.done}</strong>
              </div>
              <div className="metric-block">
                <span>Total</span>
                <strong>{backlog.total}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LearningCard({ signal }: { signal: LearningSignal }) {
  const ringClass =
    signal.severity === "critical" || signal.severity === "high"
      ? "pf-learning-high"
      : signal.severity === "medium"
        ? "pf-learning-medium"
        : "pf-learning-low";

  return (
    <Link
      href={`/portfolio/learnings#${signal.id}`}
      className={`card-surface panel pf-learning-card ${ringClass}`}
      style={{ textDecoration: "none" }}
    >
      <div className="pf-learning-top">
        <h4>{signal.title}</h4>
        <span className={`badge badge-${signal.severity === "high" || signal.severity === "critical" ? "danger" : signal.severity === "medium" ? "warning" : "neutral"}`}>
          {signal.severity}
        </span>
      </div>
      <p className="pf-learning-story">{signal.story}</p>
      <p className="pf-learning-why">{signal.why}</p>
      <p className="pf-learning-evidence">
        {signal.evidenceCount} evidence row(s)
      </p>
    </Link>
  );
}

function TrendTable({ data }: { data: DefectTrendRow[] }) {
  const weeks = Array.from(new Set(data.map((d) => d.week_start))).sort();
  const articles = Array.from(new Set(data.map((d) => d.article_name)));
  const last8 = weeks.slice(-8);

  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead>
          <tr>
            <th>Article</th>
            {last8.map((w) => (
              <th key={w}>{w.slice(5, 10)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map((art) => (
            <tr key={art}>
              <td>{art}</td>
              {last8.map((w) => {
                const row = data.find(
                  (d) => d.article_name === art && d.week_start === w
                );
                const rate = row?.defect_rate;
                return (
                  <td key={w} className={rate && rate > 0.1 ? "pf-cell-hot" : ""}>
                    {rate != null ? rate.toFixed(3) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeverityTable({ data }: { data: SeverityWeekRow[] }) {
  const weeks = Array.from(new Set(data.map((d) => d.week))).sort();
  const sevs = ["critical", "high", "medium", "low"];
  const last8 = weeks.slice(-8);

  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead>
          <tr>
            <th>Severity</th>
            {last8.map((w) => (
              <th key={w}>{w.slice(5, 10)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sevs.map((sev) => (
            <tr key={sev}>
              <td className="capitalize">{sev}</td>
              {last8.map((w) => {
                const row = data.find((d) => d.week === w && d.severity === sev);
                return <td key={w}>{row?.cnt ?? 0}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
