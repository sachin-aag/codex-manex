"use client";

import { useEffect, useState } from "react";
import { ClaimLagScatter } from "@/components/dashboard/ClaimLagScatter";
import { CostWaterfall } from "@/components/dashboard/CostWaterfall";
import { DefectTrendChart } from "@/components/dashboard/DefectTrendChart";
import { ParetoChart } from "@/components/dashboard/ParetoChart";
import { SectionHeatmap } from "@/components/dashboard/SectionHeatmap";
import { SeverityChart } from "@/components/dashboard/SeverityChart";
import {
  PortfolioTimeRange,
  type TimeRangeValue,
} from "@/components/portfolio-time-range";
import { QualityBriefingPanel } from "@/components/quality-briefing-panel";
import {
  DEFAULT_PORTFOLIO_RANGE,
  getCachedPortfolioBundle,
  isPortfolioBundleFresh,
  loadPortfolioBundle,
  type PortfolioPayload,
} from "@/lib/client/portfolio-preload";
import type { DashboardKpis } from "@/lib/db/kpis";

type KpiTone = "good" | "warn" | "bad" | "neutral";

function toneDefectOrReworkRate(rate: number): Exclude<KpiTone, "neutral"> {
  if (rate > 0.2) return "bad";
  if (rate < 0.1) return "good";
  return "warn";
}

function toneOpenActions(n: number): Exclude<KpiTone, "neutral"> {
  if (n > 30) return "bad";
  if (n <= 15) return "good";
  return "warn";
}

function toneAvgDays(d: number | null): KpiTone {
  if (d == null) return "neutral";
  if (d < 2) return "good";
  if (d > 5) return "bad";
  return "warn";
}

export default function PortfolioPage() {
  const initialBundle = getCachedPortfolioBundle(DEFAULT_PORTFOLIO_RANGE);
  const [data, setData] = useState<PortfolioPayload | null>(
    initialBundle?.portfolio ?? null,
  );
  const [dashKpis, setDashKpis] = useState<DashboardKpis | null>(
    initialBundle?.kpis ?? null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeValue>(() =>
    DEFAULT_PORTFOLIO_RANGE,
  );
  const [isFetching, setIsFetching] = useState(initialBundle == null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const effectiveRange = timeRange ?? DEFAULT_PORTFOLIO_RANGE;
      setErr(null);
      const cachedBundle = getCachedPortfolioBundle(effectiveRange);
      const cachedIsFresh = isPortfolioBundleFresh(effectiveRange);

      if (cachedBundle) {
        setData(cachedBundle.portfolio);
        setDashKpis(cachedBundle.kpis);
      }

      if (cachedBundle && cachedIsFresh) {
        setIsFetching(false);
        return;
      }

      setIsFetching(true);
      try {
        const bundle = await loadPortfolioBundle(effectiveRange, {
          force: cachedBundle != null && !cachedIsFresh,
        });
        if (!cancelled) {
          setData(bundle.portfolio);
          setDashKpis(bundle.kpis);
        }
      } catch (e) {
        if (!cancelled) {
          if (!cachedBundle) {
            setErr(e instanceof Error ? e.message : "Error loading data");
          }
        }
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  if (err) {
    return (
      <main className="page-shell">
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)" }}>{err}</p>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
            Verify the quality data connection is configured for this environment.
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
            <h1>Loading portfolio…</h1>
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

  const {
    pareto,
    weeklyRollup,
    claimLag,
    sectionHeatmap,
    severityByOccurrence,
    severityTotals,
    costBreakdown,
    claimScatter,
    bomBatchRanking,
  } = data;

  const batchTop = bomBatchRanking.slice(0, 20);
  const claimLagMax = Math.max(...claimLag.map((c) => c.cnt), 1);

  return (
    <main className="page-shell">
      <section className="hero-strip portfolio-hero-headline">
        <div>
          <p className="eyebrow">QM Portfolio</p>
          <h1>Quality Engineering — management view</h1>
        </div>
      </section>

      <QualityBriefingPanel />

      <PortfolioTimeRange
        value={timeRange}
        onChange={setTimeRange}
        isFetching={isFetching}
      />

      <section className="kpi-bar" aria-label="Quality KPIs">
        <div
          className={`kpi-card kpi-card--tone-${dashKpis ? toneDefectOrReworkRate(dashKpis.defectRate) : "neutral"}`}
        >
          <span className="kpi-card-label">Defect rate</span>
          <span className="kpi-card-value">
            {dashKpis ? dashKpis.defectRateLabel : "—"}
          </span>
          <p className="kpi-card-hint">Defects per products built</p>
        </div>
        <div
          className={`kpi-card kpi-card--tone-${dashKpis ? toneOpenActions(dashKpis.openActions) : "neutral"}`}
        >
          <span className="kpi-card-label">Open actions</span>
          <span className="kpi-card-value">
            {dashKpis ? String(dashKpis.openActions) : "—"}
          </span>
          <p className="kpi-card-hint">Pending corrective actions</p>
        </div>
        <div
          className={`kpi-card kpi-card--tone-${dashKpis ? toneDefectOrReworkRate(dashKpis.reworkRate) : "neutral"}`}
        >
          <span className="kpi-card-label">Rework rate</span>
          <span className="kpi-card-value">
            {dashKpis ? dashKpis.reworkRateLabel : "—"}
          </span>
          <p className="kpi-card-hint">Rework per products built</p>
        </div>
        <div
          className={`kpi-card kpi-card--tone-${dashKpis ? toneAvgDays(dashKpis.avgDaysToClose) : "neutral"}`}
        >
          <span className="kpi-card-label">Avg. time to close</span>
          <span className="kpi-card-value">
            {dashKpis?.avgDaysToClose != null
              ? `${dashKpis.avgDaysToClose.toFixed(1)} days`
              : "—"}
          </span>
          <p className="kpi-card-hint">Average days to first rework</p>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-dashboard-grid">
          <div className="card-surface panel chart-panel">
            <h3>Weekly trend</h3>
            <p className="chart-desc">
              Weekly defect and claim volumes and production throughput. Field
              claims are grouped by the week the claim was reported. Use the lag
              charts below for time from build to claim.
            </p>
            <DefectTrendChart data={weeklyRollup} />
          </div>
          <div className="card-surface panel chart-panel">
            <h3>Defect code Pareto</h3>
            <p className="chart-desc">
              Count per code with cumulative percentage (80% line).
            </p>
            <ParetoChart data={pareto} />
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-dashboard-grid">
          <div className="card-surface panel chart-panel">
            <h3>Detected vs. occurred</h3>
            <p className="chart-desc">
              Where defects were caught vs. where they originated (detection bias
              shows as a strong row for end-of-line gates).
            </p>
            <SectionHeatmap data={sectionHeatmap} />
          </div>
          <div className="card-surface panel chart-panel">
            <h3>Severity by occurrence section</h3>
            <p className="chart-desc">
              Stacked severity at the line where the defect originated.
            </p>
            <SeverityChart
              data={severityByOccurrence}
              globalTotals={severityTotals}
            />
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="card-surface panel chart-panel chart-panel-wide pf-claim-lag-card">
          <header className="pf-claim-lag-head">
            <h3>Field claims and lag</h3>
            <p className="chart-desc pf-claim-lag-intro">
              Each dot is one claim: when it was built and how many days until
              the field claim. The right panel summarizes claims by time from
              build to claim.
            </p>
          </header>
          <div className="pf-claim-lag-split">
            <div className="pf-claim-lag-pane pf-claim-lag-pane-scatter">
              <h4 className="pf-claim-lag-subtitle">Build date vs. lag</h4>
              <ClaimLagScatter data={claimScatter} />
            </div>
            <div className="pf-claim-lag-pane pf-claim-lag-pane-buckets">
              <h4 className="pf-claim-lag-subtitle">Lag distribution</h4>
              <div className="pf-bar-chart pf-claim-lag-bar-chart chart-plot-region">
                {claimLag.map((r) => (
                  <div className="pf-bar-row pf-claim-lag-bar-row" key={r.bucket}>
                    <span className="pf-bar-label">{r.bucket}</span>
                    <div className="pf-bar-track">
                      <div
                        className="pf-bar-fill pf-bar-teal"
                        style={{
                          width: `${(r.cnt / claimLagMax) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="pf-bar-value">{r.cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="card-surface panel chart-panel chart-panel-wide">
          <h3>Cost of poor quality</h3>
          <p className="chart-desc">
            Estimated costs from internal defects, field claims, and shop-floor
            rework.
          </p>
          <CostWaterfall data={costBreakdown} />
        </div>
      </section>

      <section className="pf-section">
        <div className="card-surface panel chart-panel-wide">
          <h3>Batch defect rate ranking</h3>
          <p className="chart-desc">
            Products with defects / products exposed to each batch (BOM). High
            rates flag supplier or material issues.
          </p>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Supplier</th>
                  <th>Part</th>
                  <th>Products</th>
                  <th>Defective</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {batchTop.map((row) => (
                  <tr key={row.batch_id}>
                    <td>{row.batch_number}</td>
                    <td>{row.supplier_name}</td>
                    <td title={row.part_title}>
                      {row.part_title.length > 40
                        ? `${row.part_title.slice(0, 38)}…`
                        : row.part_title}
                    </td>
                    <td>{row.total_products}</td>
                    <td>{row.defective_products}</td>
                    <td
                      className={
                        row.defect_rate > 0.15 ? "pf-cell-hot" : ""
                      }
                    >
                      {(row.defect_rate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {batchTop.length === 0 ? (
              <p className="chart-empty" style={{ padding: 16 }}>
                No batch-level defect data for this view.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
