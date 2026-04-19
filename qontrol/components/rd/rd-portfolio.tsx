"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { QontrolCase } from "@/lib/qontrol-data";
import type {
  ClaimLagRow,
  DefectHistoryRow,
  ProductActionRow,
} from "@/lib/db/rd";
import {
  countFcsPerPart,
  designGapFcs,
  lagDistribution,
  longLagFcs,
} from "@/lib/db/rd";
import { RdBriefingPanel } from "@/components/rd-briefing-panel";
import {
  PortfolioTimeRange,
  type TimeRangeValue,
} from "@/components/portfolio-time-range";

import { ClaimLagDonut } from "./charts/ClaimLagDonut";
import { DesignGapAlert } from "./charts/DesignGapAlert";
import { RecurringPartsTreemap } from "./charts/RecurringPartsTreemap";
import { SignalGauge } from "./charts/SignalGauge";
import { SpineHoverProvider, useSpineRowProps } from "./spine-hover-context";
import { SpineChipBar } from "./spine-chip-bar";
import { RdKpiBar, type RdKpiBarModel } from "./rd-kpi-bar";

type Props = {
  cases: QontrolCase[];
  claims: ClaimLagRow[];
  claimsPrevious: ClaimLagRow[];
  defects: DefectHistoryRow[];
  initiatives: ProductActionRow[];
  recentDecisions: ProductActionRow[];
  filter: string | null;
  part: string | null;
  timeRange: { from: string; to: string };
};

function buildRdHref(
  timeRange: { from: string; to: string },
  next: { filter?: string; part?: string },
): string {
  const p = new URLSearchParams();
  p.set("from", timeRange.from);
  p.set("to", timeRange.to);
  if (next.filter) p.set("filter", next.filter);
  if (next.part) p.set("part", next.part);
  return `/rd?${p.toString()}`;
}

function RdTimeRangeControl({ value }: { value: { from: string; to: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const onChange = useCallback(
    (range: TimeRangeValue) => {
      if (!range) return;
      startTransition(() => {
        const p = new URLSearchParams(searchParams.toString());
        p.set("from", range.from);
        p.set("to", range.to);
        router.push(`${pathname}?${p.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <PortfolioTimeRange value={value} onChange={onChange} isFetching={isPending} />
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function filterInboxCases(
  cases: QontrolCase[],
  filterKey: string | null,
  multiFcParts: ReturnType<typeof countFcsPerPart>,
  longLag: ClaimLagRow[],
  gapFcs: ClaimLagRow[],
): QontrolCase[] {
  if (!filterKey) return cases;
  if (filterKey === "recurring_part") {
    const parts = new Set(multiFcParts.map((r) => r.part_number));
    return cases.filter((c) => parts.has(c.partNumber));
  }
  if (filterKey === "long_lag") {
    const ids = new Set(longLag.map((c) => c.field_claim_id));
    return cases.filter((c) => ids.has(c.id));
  }
  if (filterKey === "design_gap") {
    const ids = new Set(gapFcs.map((c) => c.field_claim_id));
    return cases.filter((c) => ids.has(c.id));
  }
  return cases;
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="metric-card kpi-card" style={{ position: "relative" }}>
      <div className="kpi-card-label-row">
        <span>{label}</span>
        <button
          type="button"
          className="kpi-info-btn"
          aria-label={`Info: ${label}`}
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setOpen(false)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>
      <strong>{value}</strong>
      {open && (
        <div className="kpi-tooltip">{hint}</div>
      )}
    </div>
  );
}

export function RdPortfolio(props: Props) {
  return (
    <SpineHoverProvider>
      <RdPortfolioInner {...props} />
    </SpineHoverProvider>
  );
}

const timeRangeFallback = (
  <section className="pf-time-range pf-time-range-card" aria-hidden>
    <div className="pf-time-range-inner">
      <div
        className="pf-skeleton"
        style={{ height: 44, borderRadius: 10, width: "100%", maxWidth: 520 }}
      />
    </div>
  </section>
);

function RdPortfolioInner({
  cases,
  claims,
  claimsPrevious,
  defects,
  initiatives,
  recentDecisions,
  filter,
  part,
  timeRange,
}: Props) {
  const scoped = useMemo(() => {
    if (!part) return { claims, defects, cases };
    return {
      claims: claims.filter((c) => c.reported_part_number === part),
      defects: defects.filter((d) => d.reported_part_number === part),
      cases: cases.filter((c) => c.partNumber === part),
    };
  }, [claims, defects, cases, part]);

  const scopedPrevClaims = useMemo(() => {
    if (!part) return claimsPrevious;
    return claimsPrevious.filter((c) => c.reported_part_number === part);
  }, [claimsPrevious, part]);

  const recurring = useMemo(() => countFcsPerPart(scoped.claims), [scoped.claims]);
  const multiFcParts = recurring.filter((r) => r.count >= 2);
  const longLag = useMemo(() => longLagFcs(scoped.claims), [scoped.claims]);
  const gapFcs = useMemo(() => designGapFcs(scoped.claims, scoped.defects), [scoped.claims, scoped.defects]);
  const lagBuckets = useMemo(() => lagDistribution(scoped.claims), [scoped.claims]);
  const lagClaimsTotal = useMemo(
    () => lagBuckets.reduce((s, b) => s + b.count, 0),
    [lagBuckets],
  );
  const longLagPrev = useMemo(() => longLagFcs(scopedPrevClaims), [scopedPrevClaims]);

  const filteredCases = useMemo(
    () => filterInboxCases(scoped.cases, filter, multiFcParts, longLag, gapFcs),
    [scoped.cases, filter, multiFcParts, longLag, gapFcs],
  );

  const openCases = scoped.cases.filter((c) => c.state !== "closed");
  const awaitingQm = scoped.cases.filter((c) => c.state === "returned_to_qm_for_verification");
  const medianLag = useMemo(() => {
    const lags = scoped.claims
      .map((c) => c.days_from_build)
      .filter((d): d is number => typeof d === "number")
      .sort((a, b) => a - b);
    if (lags.length === 0) return null;
    const mid = Math.floor(lags.length / 2);
    return lags.length % 2 === 0 ? Math.round((lags[mid - 1] + lags[mid]) / 2) : lags[mid];
  }, [scoped.claims]);

  const rdKpiModel = useMemo((): RdKpiBarModel => {
    const gapCount = gapFcs.length;
    const lags = scoped.claims
      .map((c) => c.days_from_build)
      .filter((d): d is number => typeof d === "number");
    const avgDays = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : null;
    const avgWeeks = avgDays != null ? avgDays / 7 : null;
    const avgLagWeeksLabel = avgWeeks != null ? `${avgWeeks.toFixed(1)} wk` : "—";

    const top =
      lagBuckets.length > 0
        ? lagBuckets.reduce((a, b) => (a.count >= b.count ? a : b), lagBuckets[0]!)
        : { bucket: "", count: 0 };
    const lagPatternHint =
      scoped.claims.length === 0
        ? "No claims in this window"
        : top.count > 0
          ? `${top.bucket} pattern`
          : "No lag data";

    const longCur = longLag.length;
    const longPrev = longLagPrev.length;
    const delta = longCur - longPrev;
    let nearMissHint: string;
    if (scopedPrevClaims.length === 0) {
      nearMissHint = "—";
    } else if (longCur === 0 && longPrev === 0) {
      nearMissHint = "No long-lag FCs in either period";
    } else if (delta > 0) {
      nearMissHint = `▲ +${delta} vs. previous period`;
    } else if (delta < 0) {
      nearMissHint = `▼ ${Math.abs(delta)} vs. previous period`;
    } else {
      nearMissHint = "Flat vs. previous period";
    }

    const openCasesArt = scoped.cases.filter((c) => c.state !== "closed");
    const articleIds = Array.from(new Set(openCasesArt.map((c) => c.articleId))).filter(Boolean);
    const articlesHint =
      articleIds.length === 0
        ? "No open cases in view"
        : `${articleIds.slice(0, 2).join(", ")}${articleIds.length > 2 ? "…" : ""}`;

    let openIni = 0;
    let closedIni = 0;
    for (const i of initiatives) {
      if (i.status === "open" || i.status === "in_progress") openIni++;
      else if (i.status === "done" || i.status === "closed") closedIni++;
    }
    const totalIni = initiatives.length;
    const fmeaValueLabel = totalIni > 0 ? `${openIni} / ${totalIni}` : "—";
    const fmeaHint =
      totalIni > 0 ? `${closedIni} closed this period` : "No product actions in this window";

    return {
      designLeakCount: gapCount,
      avgLagWeeksLabel,
      lagPatternHint,
      nearMissCount: longCur,
      nearMissHint,
      articlesCount: articleIds.length,
      articlesHint,
      fmeaValueLabel,
      fmeaHint,
      tones: {
        designLeak: gapCount > 0 ? "bad" : "good",
        avgLag: avgWeeks == null ? "neutral" : avgWeeks > 8 ? "warn" : "good",
        nearMiss:
          scopedPrevClaims.length === 0
            ? "neutral"
            : delta > 0
              ? "warn"
              : delta < 0
                ? "good"
                : "neutral",
        articles: "neutral",
        fmea: openIni > 0 ? "warn" : "neutral",
      },
    };
  }, [
    gapFcs,
    lagBuckets,
    longLag,
    longLagPrev,
    scoped.claims,
    scoped.cases,
    scopedPrevClaims,
    initiatives,
  ]);

  return (
    <main className="page-shell" data-dept="rd">
      {part && (
        <SpineChipBar
          spine={{ part, article: scoped.cases[0]?.articleId ?? null }}
          allowClear
        />
      )}

      <section className="hero-strip">
        <div>
          <p className="eyebrow">R&D · Design / Reliability</p>
          <h1>{part ? `Focus on ${part}` : "R&D Workspace"}</h1>
          <p className="hero-copy">
            Triage field claims routed to R&D. Every panel narrows the same spine — click a row to focus
            the page on that part.
          </p>
        </div>
        <div className="hero-stats">
          <KpiCard
            label="Open R&D cases"
            value={openCases.length}
            hint="Cases routed to R&D that have not been closed yet — includes acknowledged, in-progress, and waiting-for-evidence tickets."
          />
          <KpiCard
            label="Awaiting QM verify"
            value={awaitingQm.length}
            hint="R&D proposed a fix and flipped the case back to QM. These are waiting for QM to verify the fix before closing."
          />
          <KpiCard
            label="Median lag (FCs)"
            value={medianLag !== null ? `${medianLag} d` : "-"}
            hint="Median days_from_build across field claims in this window (with numeric lag). High values (>56 d) suggest latent design issues that only surface after extended use."
          />
        </div>
      </section>

      <div className="top-gap">
        <RdBriefingPanel />
      </div>

      <div className="top-gap">
        <Suspense fallback={timeRangeFallback}>
          <RdTimeRangeControl value={timeRange} />
        </Suspense>
      </div>

      <div className="top-gap">
        <RdKpiBar model={rdKpiModel} />
      </div>

      <section className="card-surface top-gap">
        <div className="rd-panel-header">
          <div>
            <h3>Signal thresholds</h3>
            <p>Live rules on design-related FC patterns. Click a gauge to focus the page.</p>
          </div>
        </div>
        <div className="rd-gauge-grid">
          <SignalGauge
            href={buildRdHref(timeRange, { filter: "recurring_part", part: part ?? undefined })}
            label="2+ FCs on same part"
            value={multiFcParts.length}
            max={10}
            tone="primary"
            subtitle={
              multiFcParts[0]
                ? `Top: ${multiFcParts[0].part_number} (${multiFcParts[0].count})`
                : "No recurring parts"
            }
          />
          <SignalGauge
            href={buildRdHref(timeRange, { filter: "long_lag", part: part ?? undefined })}
            label="Lag &gt; 8 weeks"
            value={longLag.length}
            max={20}
            tone={longLag.length > 0 ? "warning" : "primary"}
            subtitle={longLag.length > 0 ? "Latent design signal" : "No long-lag FCs"}
          />
          <SignalGauge
            href={buildRdHref(timeRange, { filter: "design_gap", part: part ?? undefined })}
            label="FC with no factory defect"
            value={gapFcs.length}
            max={15}
            tone={gapFcs.length > 0 ? "danger" : "primary"}
            subtitle={gapFcs.length > 0 ? "Design gap suspected" : "Factory caught every part"}
          />
        </div>
      </section>

      <div className="rd-dashboard-stack top-gap">
        <div className="rd-grid rd-dashboard-row">
          <div className="stack-list">
            <RdInboxPanel
              cases={scoped.cases}
              filteredCases={filteredCases}
              filter={filter}
              part={part}
              timeRange={timeRange}
            />

            <section className="card-surface rd-chart-panel">
              <div className="rd-panel-header">
                <div>
                  <h3>Design-gap FCs</h3>
                  <p className="chart-desc">Field claims with zero matching factory defects on that part.</p>
                </div>
              </div>
              <DesignGapAlert gapFcs={gapFcs} maxRows={4} />
            </section>
          </div>

          <div className="stack-list">
            <section className="card-surface panel chart-panel rd-chart-panel">
              <div className="rd-panel-header">
                <div>
                  <h3>Claim lag distribution</h3>
                  <p className="chart-desc">
                    Share of lag buckets among {lagClaimsTotal} claim(s) with numeric lag (
                    {scoped.claims.length} total in window).
                  </p>
                </div>
              </div>
              <ClaimLagDonut buckets={lagBuckets} total={lagClaimsTotal} />
            </section>
          </div>
        </div>

        <div className="top-gap">
          <section className={`card-surface panel chart-panel rd-chart-panel ${part ? "rd-panel--anchored" : ""}`}>
            <div className="rd-panel-header">
              <div>
                <h3>Recurring parts in claims</h3>
                <p className="chart-desc">
                  {multiFcParts.length} part(s) with 2+ FCs — rectangle size = claim count.
                </p>
              </div>
              {part && (
                <span className="rd-origin-badge">
                  <em>from spine</em>·{part}
                </span>
              )}
            </div>
            <RecurringPartsTreemap rows={recurring} maxShown={12} />
          </section>
        </div>

        <RecentDecisionsPanel decisions={recentDecisions} />
      </div>
    </main>
  );
}

type InboxProps = {
  cases: QontrolCase[];
  filteredCases: QontrolCase[];
  filter: string | null;
  part: string | null;
  timeRange: { from: string; to: string };
};

function RdInboxPanel({ cases, filteredCases, filter, part, timeRange }: InboxProps) {
  return (
    <section className="card-surface">
      <div className="rd-panel-header">
        <div>
          <h3>R&D Inbox</h3>
          <p>
            {filteredCases.length} of {cases.length} cases
            {filter ? ` · filter: ${filter.replace("_", " ")}` : ""}
            {part ? ` · part: ${part}` : ""}
          </p>
        </div>
        {filter && (
          <Link href={buildRdHref(timeRange, { part: part ?? undefined })} className="rd-back-link">
            Clear filter
          </Link>
        )}
      </div>
      {filteredCases.length === 0 ? (
        <p className="rd-empty">Nothing in the inbox matches.</p>
      ) : (
        <div style={{ padding: "0 18px 14px" }}>
          <div
            className="rd-bar-row rd-inbox-table-header"
            style={{ gridTemplateColumns: "110px 1fr 110px 70px 70px 120px", color: "var(--text-muted)", fontSize: 10, fontWeight: 700, letterSpacing: 0.06, textTransform: "uppercase" }}
          >
            <span>Case</span>
            <span>Article · title</span>
            <span>Part</span>
            <span>Severity</span>
            <span>Source</span>
            <span>Last update</span>
          </div>
          {filteredCases.map((c) => (
            <RdInboxRow key={c.id} case={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function RdInboxRow({ case: c }: { case: QontrolCase }) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({
    part: c.partNumber,
    articleId: c.articleId,
    caseId: c.id,
  });
  return (
    <Link
      href={`/?case=${encodeURIComponent(c.id)}`}
      className={`rd-row rd-row-link rd-inbox-row ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <strong>{c.id}</strong>
      <span>
        {c.articleId} · {c.title}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.partNumber}</span>
      <span>
        <span className={`badge badge-${c.severity === "high" ? "danger" : c.severity === "medium" ? "warning" : "success"}`}>
          {c.severity}
        </span>
      </span>
      <span>{c.sourceType === "defect" ? "D" : "FC"}</span>
      <small>{fmtDate(c.lastUpdateAt)}</small>
    </Link>
  );
}

function RecentDecisionsPanel({ decisions }: { decisions: ProductActionRow[] }) {
  return (
    <section className="card-surface">
      <div className="rd-panel-header">
        <div>
          <h3>Recent R&D decisions</h3>
          <p>Write-back log from R&D for QM to verify.</p>
        </div>
      </div>
      {decisions.length === 0 ? (
        <p className="rd-empty">No decisions recorded yet.</p>
      ) : (
        <ul className="rd-list" style={{ padding: "0 18px 14px" }}>
          {decisions.map((d) => {
            const headline = d.comments?.split(" :: ")[0] ?? d.comments ?? d.status;
            return (
              <li key={d.action_id}>
                <span>
                  <code>{d.status}</code> — {d.product_id}
                  {d.defect_id ? ` · ${d.defect_id}` : ""}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {headline.length > 80 ? `${headline.slice(0, 80)}…` : headline}
                  </div>
                </span>
                <small>{fmtDate(d.ts)}</small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
