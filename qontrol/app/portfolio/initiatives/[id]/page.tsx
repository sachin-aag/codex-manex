"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InitiativeChange } from "@/lib/initiative-change";
import { dimensionColorClass } from "@/lib/initiative-change";

type Initiative = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: string;
  user_id: string | null;
  comments: string | null;
  defect_id: string | null;
};

type DefectDetail = {
  defect_id: string;
  product_id: string;
  defect_ts: string;
  defect_code: string;
  article_id: string;
  reported_part_title: string | null;
};

type QualitySummaryRow = {
  week_start: string;
  defect_count: number;
  products_built: number;
  claim_count?: number;
};

type FieldClaim = {
  field_claim_id: string;
  claim_ts: string | null;
  market: string | null;
  complaint_text: string | null;
  days_from_build: number | null;
};

type DetailPayload = {
  initiative: Initiative;
  defect: DefectDetail | null;
  quality: QualitySummaryRow[];
  claims: FieldClaim[];
  change: InitiativeChange;
  kpis: {
    affectedProducts: number;
    fieldClaimsTotal: number;
    affectedBatches: number;
  };
};

export default function InitiativeDetailPage() {
  const params = useParams<{ id: string }>();
  const initiativeId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [data, setData] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!initiativeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portfolio/initiatives/${initiativeId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load initiative");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initiativeId]);

  const initiative = data?.initiative ?? null;
  const title = initiative ? formatActionTypeTitle(initiative.action_type) : "Initiative";
  const commentFull = initiative ? fullCommentWithoutJson(initiative.comments) : "";
  const date = initiative ? formatDate(initiative.ts) : "—";

  const progressLineX = useMemo(() => {
    if (!initiative?.ts || !data?.quality?.length) return null;
    const initiativeDate = new Date(initiative.ts);
    if (Number.isNaN(initiativeDate.getTime())) return initiative.ts.slice(0, 10);
    const targetTime = initiativeDate.getTime();
    let candidate = data.quality[0]?.week_start ?? null;
    for (const row of data.quality) {
      const t = new Date(row.week_start).getTime();
      if (Number.isNaN(t)) continue;
      if (t <= targetTime) candidate = row.week_start;
    }
    return candidate;
  }, [initiative?.ts, data?.quality]);

  const hasClaimSeries = useMemo(
    () => (data?.quality ?? []).some((row) => typeof row.claim_count === "number"),
    [data?.quality],
  );

  const beforeAfterDelta = useMemo(() => {
    const quality = data?.quality ?? [];
    if (!initiative || initiative.status !== "done" || quality.length === 0) return null;
    const pivot = new Date(initiative.ts).getTime();
    if (Number.isNaN(pivot)) return null;
    const before = quality.filter((row) => new Date(row.week_start).getTime() < pivot).slice(-4);
    const after = quality.filter((row) => new Date(row.week_start).getTime() >= pivot).slice(0, 4);
    if (!before.length || !after.length) return null;
    const beforeAvg = before.reduce((sum, row) => sum + row.defect_count, 0) / before.length;
    const afterAvg = after.reduce((sum, row) => sum + row.defect_count, 0) / after.length;
    if (beforeAvg <= 0) return null;
    const pct = ((afterAvg - beforeAvg) / beforeAvg) * 100;
    return { beforeAvg, afterAvg, pct };
  }, [initiative, data?.quality]);

  if (err) {
    return (
      <main className="page-shell">
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p>
        </div>
      </main>
    );
  }

  if (!initiativeId) {
    return (
      <main className="page-shell">
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)", margin: 0 }}>Initiative ID fehlt.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page-shell">
        <div className="card-surface panel">
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>Loading initiative…</p>
        </div>
      </main>
    );
  }

  const initiativeView = data.initiative;

  return (
    <main className="page-shell">
      <Link
        href="/portfolio/initiatives"
        className="ghost-button"
        style={{ textDecoration: "none", alignSelf: "flex-start" }}
      >
        ← Zurück
      </Link>

      <section className="initiative-detail-shell">
        <header className="initiative-detail-header">
          <div className="initiative-detail-title-row">
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>Initiative</p>
              <h1 style={{ margin: 0 }}>{title}</h1>
            </div>
            <span className={statusBadgeClass(initiativeView.status)}>{formatStatusLabel(initiativeView.status)}</span>
          </div>
          <div className="initiative-detail-meta">
            <span className="initiative-chip" title={initiativeView.user_id ?? "Unassigned"}>
              <UserIcon />
              <span className="initiative-chip-text">{formatAssigneeLabel(initiativeView.user_id)}</span>
            </span>
            <div className="initiative-detail-meta-right">
              <span className="initiative-detail-meta-item">{date}</span>
              <span className="initiative-detail-meta-item initiative-detail-mono">{initiativeView.action_id}</span>
            </div>
          </div>
        </header>

        <section className="card-surface panel initiative-change-hero">
          <div className="panel-header">
            <div>
              <h2 style={{ margin: 0 }}>Was sich ändert</h2>
              <p style={{ margin: "6px 0 0" }}>{data.change.dimensionLabel}</p>
            </div>
          </div>
          <div className={`initiative-change-hero-grid ${dimensionColorClass(data.change.dimension)}`}>
            <div className="initiative-change-hero-col initiative-change-hero-before">
              <p className="initiative-change-hero-label">Vorher</p>
              <p className="initiative-change-hero-value">{data.change.before}</p>
              <p className="initiative-change-hero-sub">{data.change.evidence ?? "—"}</p>
            </div>
            <div className="initiative-change-hero-col initiative-change-hero-action">
              <p className="initiative-change-hero-label">Massnahme</p>
              <p className="initiative-change-hero-value">{title}</p>
              <p className="initiative-change-hero-sub">{commentFull || "Keine zusätzliche Beschreibung"}</p>
            </div>
            <div className={`initiative-change-hero-col ${afterToneClass(initiativeView.status)}`}>
              <p className="initiative-change-hero-label">Nachher</p>
              <p className="initiative-change-hero-value">{data.change.after}</p>
              <p className="initiative-change-hero-sub">{formatStatusLabel(initiativeView.status)}</p>
            </div>
          </div>
        </section>

        {data.defect ? (
          <section className="card-surface panel initiative-detail-section">
            <div className="panel-header">
              <div>
                <h2 style={{ margin: 0 }}>Verlinkter Defekt</h2>
                <p style={{ margin: "6px 0 0" }}>Details aus <code>v_defect_detail</code>.</p>
              </div>
            </div>
            <div className="initiative-detail-kpi-row initiative-detail-kpi-row-3">
              <div className="metric-card initiative-kpi-tile">
                <strong>{data.kpis.affectedProducts}</strong>
                <span>Betroffene Produkte</span>
              </div>
              <div className="metric-card initiative-kpi-tile">
                <strong>{data.kpis.fieldClaimsTotal}</strong>
                <span>Field Claims</span>
              </div>
              <div className="metric-card initiative-kpi-tile">
                <strong>{data.kpis.affectedBatches}</strong>
                <span>Betroffene Batches</span>
              </div>
            </div>
            <div className="initiative-detail-grid">
              <div className="metric-block">
                <span>Defect Code</span>
                <strong>{data.defect.defect_code}</strong>
              </div>
              <div className="metric-block">
                <span>Produkt-ID</span>
                <strong>{data.defect.product_id}</strong>
              </div>
              <div className="metric-block">
                <span>Datum</span>
                <strong>{formatDate(data.defect.defect_ts)}</strong>
              </div>
              <div className="metric-block">
                <span>Betroffener Part</span>
                <strong>{data.defect.reported_part_title ?? "—"}</strong>
              </div>
            </div>
          </section>
        ) : null}

        <section className="card-surface panel initiative-detail-section">
          <div className="panel-header">
            <div>
              <h2 style={{ margin: 0 }}>Before/After Graph</h2>
              <p style={{ margin: "6px 0 0" }}>
                Wöchentliche Defekte und Claims über Zeit mit Maßnahme-Marker.
              </p>
            </div>
          </div>

          {data.quality.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              Keine Quality Summary Daten gefunden.
            </p>
          ) : (
            <div className="initiative-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.quality} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="week_start"
                    tickFormatter={(v) => String(v).slice(5, 10)}
                    tick={{ fill: "rgba(15, 23, 42, 0.65)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(15, 23, 42, 0.65)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [value, name === "claim_count" ? "Field Claims" : "Defects"]}
                    labelFormatter={(label) => `Week: ${String(label)}`}
                  />
                  <Line type="monotone" dataKey="defect_count" stroke="var(--brand)" strokeWidth={2} dot={false} />
                  {hasClaimSeries ? (
                    <Line type="monotone" dataKey="claim_count" stroke="#f97316" strokeWidth={2} dot={false} />
                  ) : null}
                  {progressLineX ? (
                    <ReferenceLine
                      x={progressLineX}
                      stroke="#f97316"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: "Maßnahme",
                        position: "insideTop",
                        fill: "#c2410c",
                        fontSize: 11,
                      }}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
              <div className="initiative-chart-legend">
                <span className="initiative-chart-legend-item">
                  <span className="initiative-chart-dot initiative-chart-dot-defect" />
                  Defekte pro Woche
                </span>
                {hasClaimSeries ? (
                  <span className="initiative-chart-legend-item">
                    <span className="initiative-chart-dot initiative-chart-dot-claim" />
                    Field Claims pro Woche
                  </span>
                ) : null}
              </div>
              {beforeAfterDelta ? (
                <p className="initiative-delta-text">
                  Defekte pro Woche: {beforeAfterDelta.beforeAvg.toFixed(1)} →{" "}
                  {beforeAfterDelta.afterAvg.toFixed(1)} ({beforeAfterDelta.pct.toFixed(0)}%)
                </p>
              ) : null}
            </div>
          )}
        </section>

        {initiativeView.defect_id && data.claims.length > 0 ? (
          <section className="card-surface panel initiative-detail-section">
            <div className="panel-header">
              <div>
                <h2 style={{ margin: 0 }}>Verwandte Field Claims</h2>
                <p style={{ margin: "6px 0 0" }}>Claims, die diesem Defekt zugeordnet sind.</p>
              </div>
            </div>
            <div className="initiative-claim-list">
              {data.claims.map((c) => (
                <div key={c.field_claim_id} className="initiative-claim-row">
                  <div>
                    <p className="initiative-claim-id">{c.field_claim_id}</p>
                    <p className="initiative-claim-text">{c.complaint_text ?? "—"}</p>
                  </div>
                  <div className="initiative-claim-meta">
                    <span>{c.market ?? "—"}</span>
                    <span>{c.claim_ts ? formatDate(c.claim_ts) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="card-surface panel initiative-detail-section">
          <div className="panel-header">
            <div>
              <h2 style={{ margin: 0 }}>Timeline</h2>
              <p style={{ margin: "6px 0 0" }}>Wichtigste Status-Events der Initiative.</p>
            </div>
          </div>
          <ul className="initiative-timeline">
            <li>
              <span className="initiative-timeline-dot" />
              <div>
                <strong>Erstellt am {formatDate(initiativeView.ts)}</strong>
                <p>Status: {formatStatusLabel(initiativeView.status)}</p>
              </div>
            </li>
            {(initiativeView.status === "done" || initiativeView.status === "closed") ? (
              <li>
                <span className="initiative-timeline-dot initiative-timeline-dot-done" />
                <div>
                  <strong>Abgeschlossen am {formatDate(initiativeView.ts)}</strong>
                  <p>Initiative wurde als done markiert.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      </section>
    </main>
  );
}

function fullCommentWithoutJson(comment: string | null) {
  const trimmed = comment?.trim();
  if (!trimmed) return "";
  const brace = trimmed.indexOf("{");
  if (brace === -1) return trimmed;
  return trimmed.slice(0, brace).replace(/[\s:]+$/, "").trim();
}

function statusBadgeClass(status: string | null) {
  if (status === "done" || status === "closed") return "badge initiative-status initiative-status-done";
  if (status === "in_progress") return "badge initiative-status initiative-status-in-progress";
  if (status === "assigned") return "badge initiative-status initiative-status-assigned";
  if (status === "proposed_fix") return "badge initiative-status initiative-status-proposed-fix";
  if (status === "open") return "badge initiative-status initiative-status-open";
  return "badge badge-neutral";
}

function formatStatusLabel(status: string | null) {
  if (!status) return "Unknown";
  if (status === "in_progress") return "In Progress";
  if (status === "proposed_fix") return "Proposed Fix";
  if (status === "done") return "Done";
  if (status === "open") return "Open";
  if (status === "assigned") return "Assigned";
  return titleCase(status.replaceAll("_", " "));
}

function formatActionTypeTitle(actionType: string | null) {
  const value = actionType?.trim();
  if (!value) return "Initiative";
  if (value === "corrective" || value === "corrective_action") return "Corrective Action";
  if (value === "initiate_8d" || value === "8d" || value === "report_8d") return "8D Report";
  if (value === "root_cause") return "Root Cause";
  if (value === "containment") return "Containment";
  if (value === "verification") return "Verification";
  if (value === "assignment") return "Assignment";
  return titleCase(value.replaceAll("_", " "));
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(ts: string | null) {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts.slice(0, 10);
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatAssigneeLabel(userId: string | null) {
  const value = userId?.trim();
  if (!value) return "Unassigned";
  if (value.toLowerCase() === "rd") return "R&D";
  if (value.toLowerCase() === "qm") return "QM";
  return value;
}

function afterToneClass(status: string | null) {
  if (status === "done" || status === "closed") return "initiative-change-hero-after-done";
  if (status === "in_progress") return "initiative-change-hero-after-progress";
  return "initiative-change-hero-after-open";
}

function UserIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="initiative-chip-icon"
    >
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.58-4.5-8-4.5"
      />
    </svg>
  );
}

