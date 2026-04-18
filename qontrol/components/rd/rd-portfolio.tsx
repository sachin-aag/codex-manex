"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

import { SpineHoverProvider, useSpineRowProps } from "./spine-hover-context";
import { SpineChipBar } from "./spine-chip-bar";

type Props = {
  cases: QontrolCase[];
  claims: ClaimLagRow[];
  defects: DefectHistoryRow[];
  recentDecisions: ProductActionRow[];
  filter: string | null;
  part: string | null;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="metric-card" style={{ position: "relative" }}>
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

function RdPortfolioInner({
  cases,
  claims,
  defects,
  recentDecisions,
  filter,
  part,
}: Props) {
  const scoped = useMemo(() => {
    if (!part) return { claims, defects, cases };
    return {
      claims: claims.filter((c) => c.reported_part_number === part),
      defects: defects.filter((d) => d.reported_part_number === part),
      cases: cases.filter((c) => c.partNumber === part),
    };
  }, [claims, defects, cases, part]);

  const recurring = useMemo(() => countFcsPerPart(scoped.claims), [scoped.claims]);
  const multiFcParts = recurring.filter((r) => r.count >= 2);
  const longLag = useMemo(() => longLagFcs(scoped.claims), [scoped.claims]);
  const gapFcs = useMemo(() => designGapFcs(scoped.claims, scoped.defects), [scoped.claims, scoped.defects]);
  const lagBuckets = useMemo(() => lagDistribution(scoped.claims), [scoped.claims]);

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
            label="Median lag (open FCs)"
            value={medianLag !== null ? `${medianLag} d` : "-"}
            hint="Median days_from_build across open field claims. High values (>56 d) suggest latent design issues that only surface after extended use."
          />
        </div>
      </section>

      <section className="card-surface">
        <div className="rd-panel-header">
          <div>
            <h3>Signal thresholds</h3>
            <p>Live rules on design-related FC patterns. Click a tile to focus the page.</p>
          </div>
        </div>
        <div className="rd-tile-grid">
          <Link
            href={`/rd?filter=recurring_part${part ? `&part=${part}` : ""}`}
            className={`rd-tile rd-tile-link ${multiFcParts.length > 0 ? "is-primary" : ""}`}
          >
            <span className="rd-tile-label">2+ FCs on same part</span>
            <span className="rd-tile-value">{multiFcParts.length}</span>
            <span className="rd-tile-sub">
              {multiFcParts[0]
                ? `Top: ${multiFcParts[0].part_number} (${multiFcParts[0].count})`
                : "No recurring parts"}
            </span>
          </Link>
          <Link
            href={`/rd?filter=long_lag${part ? `&part=${part}` : ""}`}
            className={`rd-tile rd-tile-link ${longLag.length > 0 ? "is-warning" : ""}`}
          >
            <span className="rd-tile-label">Lag &gt; 8 weeks</span>
            <span className="rd-tile-value">{longLag.length}</span>
            <span className="rd-tile-sub">
              {longLag.length > 0 ? "Latent design signal" : "No long-lag FCs"}
            </span>
          </Link>
          <Link
            href={`/rd?filter=design_gap${part ? `&part=${part}` : ""}`}
            className={`rd-tile rd-tile-link ${gapFcs.length > 0 ? "is-danger" : ""}`}
          >
            <span className="rd-tile-label">FC with no factory defect</span>
            <span className="rd-tile-value">{gapFcs.length}</span>
            <span className="rd-tile-sub">
              {gapFcs.length > 0 ? "Design gap suspected" : "Factory caught every part"}
            </span>
          </Link>
        </div>
      </section>

      <div className="rd-grid top-gap">
        <div className="stack-list">
          <RdInboxPanel
            cases={scoped.cases}
            filter={filter}
            multiFcParts={multiFcParts}
            longLag={longLag}
            gapFcs={gapFcs}
            part={part}
          />

          <RecurringPartsPanel recurring={recurring} multiFcParts={multiFcParts} scoped={part} />
        </div>

        <div className="stack-list">
          <LagDistributionPanel buckets={lagBuckets} total={scoped.claims.length} />

          <DesignGapPanel gapFcs={gapFcs} />

          <RecentDecisionsPanel decisions={recentDecisions} />
        </div>
      </div>
    </main>
  );
}

type InboxProps = {
  cases: QontrolCase[];
  filter: string | null;
  multiFcParts: ReturnType<typeof countFcsPerPart>;
  longLag: ClaimLagRow[];
  gapFcs: ClaimLagRow[];
  part: string | null;
};

function RdInboxPanel({ cases, filter, multiFcParts, longLag, gapFcs, part }: InboxProps) {
  const filtered = useMemo(() => {
    if (!filter) return cases;
    if (filter === "recurring_part") {
      const parts = new Set(multiFcParts.map((r) => r.part_number));
      return cases.filter((c) => parts.has(c.partNumber));
    }
    if (filter === "long_lag") {
      const ids = new Set(longLag.map((c) => c.field_claim_id));
      return cases.filter((c) => ids.has(c.id));
    }
    if (filter === "design_gap") {
      const ids = new Set(gapFcs.map((c) => c.field_claim_id));
      return cases.filter((c) => ids.has(c.id));
    }
    return cases;
  }, [cases, filter, multiFcParts, longLag, gapFcs]);

  return (
    <section className="card-surface">
      <div className="rd-panel-header">
        <div>
          <h3>R&D Inbox</h3>
          <p>
            {filtered.length} of {cases.length} cases
            {filter ? ` · filter: ${filter.replace("_", " ")}` : ""}
            {part ? ` · part: ${part}` : ""}
          </p>
        </div>
        {filter && (
          <Link href={`/rd${part ? `?part=${part}` : ""}`} className="rd-back-link">
            Clear filter
          </Link>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="rd-empty">Nothing in the inbox matches.</p>
      ) : (
        <div style={{ padding: "0 18px 14px" }}>
          <div className="rd-bar-row" style={{ gridTemplateColumns: "110px 1fr 110px 70px 70px 120px", color: "var(--text-muted)", fontSize: 10, fontWeight: 700, letterSpacing: 0.06, textTransform: "uppercase" }}>
            <span>Case</span>
            <span>Article · title</span>
            <span>Part</span>
            <span>Severity</span>
            <span>Source</span>
            <span>Last update</span>
          </div>
          {filtered.map((c) => (
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
      href={`/rd/${c.id}`}
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

function RecurringPartsPanel({
  recurring,
  multiFcParts,
  scoped,
}: {
  recurring: ReturnType<typeof countFcsPerPart>;
  multiFcParts: ReturnType<typeof countFcsPerPart>;
  scoped: string | null;
}) {
  const max = Math.max(1, ...recurring.map((r) => r.count));
  const shown = recurring.slice(0, 8);

  return (
    <section className={`card-surface ${scoped ? "rd-panel--anchored" : ""}`}>
      <div className="rd-panel-header">
        <div>
          <h3>Recurring parts in claims</h3>
          <p>
            {multiFcParts.length} part(s) with 2+ FCs. Hover a row to see links glow across panels.
          </p>
        </div>
        {scoped && <span className="rd-origin-badge"><em>from spine</em>·{scoped}</span>}
      </div>
      {shown.length === 0 ? (
        <p className="rd-empty">No claims to group by part.</p>
      ) : (
        <div style={{ padding: "0 18px 14px" }}>
          {shown.map((r) => (
            <RecurringPartRow key={r.part_number} row={r} max={max} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecurringPartRow({
  row,
  max,
}: {
  row: ReturnType<typeof countFcsPerPart>[number];
  max: number;
}) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({ part: row.part_number });
  return (
    <Link
      href={`/rd?filter=recurring_part&part=${row.part_number}`}
      className={`rd-row rd-row-link ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ gridTemplateColumns: "140px 1fr 40px" }}
      title={row.articles.join(", ")}
    >
      <span className="rd-bar-label">{row.part_number}</span>
      <span className="rd-bar-track">
        <span className="rd-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
      </span>
      <span className="rd-bar-value">{row.count}</span>
    </Link>
  );
}

function LagDistributionPanel({ buckets, total }: { buckets: ReturnType<typeof lagDistribution>; total: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <section className="card-surface">
      <div className="rd-panel-header">
        <div>
          <h3>Claim lag distribution</h3>
          <p>days_from_build across {total} claims.</p>
        </div>
      </div>
      <div style={{ padding: "0 18px 14px" }}>
        {buckets.map((b) => (
          <div
            key={b.bucket}
            className="rd-bar-row"
            style={{ gridTemplateColumns: "80px 1fr 40px" }}
          >
            <span className="rd-bar-label">{b.bucket}</span>
            <span className="rd-bar-track">
              <span
                className="rd-bar-fill"
                style={{
                  width: `${(b.count / max) * 100}%`,
                  background: b.bucket === "8-12 wk" || b.bucket === "12+ wk" ? "var(--warning)" : "var(--rd-accent)",
                }}
              />
            </span>
            <span className="rd-bar-value">{b.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DesignGapPanel({ gapFcs }: { gapFcs: ClaimLagRow[] }) {
  return (
    <section className="card-surface">
      <div className="rd-panel-header">
        <div>
          <h3>Design-gap FCs</h3>
          <p>Field claims with zero matching factory defects on that part.</p>
        </div>
      </div>
      {gapFcs.length === 0 ? (
        <p className="rd-empty">No design-gap FCs right now.</p>
      ) : (
        <div style={{ padding: "0 18px 14px" }}>
          {gapFcs.slice(0, 6).map((c) => (
            <GapRow key={c.field_claim_id} claim={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function GapRow({ claim }: { claim: ClaimLagRow }) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({
    part: claim.reported_part_number,
    articleId: claim.article_id,
    caseId: claim.field_claim_id,
  });
  return (
    <Link
      href={`/rd/${claim.field_claim_id}`}
      className={`rd-row rd-row-link ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ gridTemplateColumns: "110px 1fr 70px" }}
    >
      <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--rd-accent-strong)" }}>
        {claim.field_claim_id}
      </strong>
      <span style={{ fontSize: 12 }}>
        {claim.reported_part_number} · {claim.article_name ?? claim.article_id}
      </span>
      <small>{claim.days_from_build ?? "-"}d lag</small>
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
