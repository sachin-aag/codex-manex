"use client";

import { useEffect, useMemo, useState } from "react";
import type { InitiativeChange } from "@/lib/initiative-change";
import { dimensionColorClass } from "@/lib/initiative-change";
import Link from "next/link";

type FilterKey =
  | "all"
  | "open"
  | "in_progress"
  | "assigned"
  | "proposed_fix"
  | "done";

type CreateFormState = {
  defectId: string;
  type: string;
  comment: string;
};

type InitiativeListItem = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: string;
  user_id: string | null;
  comments: string | null;
  defect_id: string | null;
  change: InitiativeChange;
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "assigned", label: "Assigned" },
  { key: "proposed_fix", label: "Proposed Fix" },
  { key: "done", label: "Done" },
];

const TYPE_OPTIONS = [
  "containment",
  "root_cause",
  "corrective_action",
  "verification",
  "assignment",
];

const EMPTY_FORM: CreateFormState = {
  defectId: "",
  type: TYPE_OPTIONS[0],
  comment: "",
};

export default function InitiativesPage() {
  const [rows, setRows] = useState<InitiativeListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portfolio/initiatives");
        if (!res.ok) throw new Error("Failed to load initiatives");
        const data = await res.json();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (activeFilter === "all") return rows;
    return rows.filter((row) => row.status === activeFilter);
  }, [activeFilter, rows]);

  const filterCounts = useMemo(() => {
    if (!rows) return null;
    const counts = new Map<FilterKey, number>();
    counts.set("all", rows.length);
    for (const { key } of FILTERS) {
      if (key !== "all") counts.set(key, 0);
    }
    for (const row of rows) {
      const status = row.status as FilterKey;
      if (counts.has(status)) counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const topKpis = useMemo(() => {
    const open = rows?.filter((row) => row.status === "open").length ?? 0;
    const inProgress = rows?.filter((row) => row.status === "in_progress").length ?? 0;
    const done = rows?.filter((row) => row.status === "done").length ?? 0;
    const total = rows?.length ?? 0;
    const donePct = total > 0 ? (done / total) * 100 : 0;
    return { open, inProgress, done, total, donePct };
  }, [rows]);

  async function refreshInitiatives() {
    const res = await fetch("/api/portfolio/initiatives");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load initiatives");
    }
    setRows(data);
  }

  function closeModal() {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setSubmitError(null);
    setIsSubmitting(false);
  }

  async function handleCreateInitiative(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/portfolio/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create initiative");
      }

      await refreshInitiatives();
      closeModal();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create initiative",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">QM Portfolio</p>
          <div className="initiative-hero-title-row">
            <h1>Initiatives & impact</h1>
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowModal(true)}
            >
              Neue Initiative
            </button>
          </div>
          <p className="hero-copy">
            Von der Erkenntnis zur Maßnahme — verfolge alle laufenden
            Korrektiv-Aktionen und schließe den Qualitätskreis.
          </p>
          <div className="initiative-kpi-row">
            <InitiativeKpiTile value={topKpis.open} label="Offen" />
            <InitiativeKpiTile value={topKpis.inProgress} label="In Bearbeitung" />
            <InitiativeKpiTile value={topKpis.done} label="Abgeschlossen" />
          </div>
          <div className="initiative-progress-block">
            <p className="initiative-progress-text">
              {topKpis.done} von {topKpis.total} Initiativen abgeschlossen
            </p>
            <div className="initiative-progress-track" role="presentation">
              <div
                className="initiative-progress-fill"
                style={{ width: `${topKpis.donePct}%` }}
              />
            </div>
          </div>
        </div>
        <Link href="/portfolio" className="ghost-button" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          ← Back to portfolio
        </Link>
      </section>
      {err ? (
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)" }}>{err}</p>
        </div>
      ) : null}
      <div className="initiative-filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={filter.key === activeFilter ? "secondary-button" : "ghost-button"}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}{" "}
            <span className="initiative-filter-count">
              ({filterCounts ? (filterCounts.get(filter.key) ?? 0) : "…"})
            </span>
          </button>
        ))}
      </div>
      <div className="initiative-grid">
        {filteredRows
          ? filteredRows.map((row) => <InitiativeCard key={row.action_id} row={row} />)
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-surface panel initiative-card-skeleton">
                <div className="pf-skeleton" style={{ height: 20 }} />
                <div className="pf-skeleton" style={{ height: 16 }} />
                <div className="pf-skeleton" style={{ height: 80 }} />
              </div>
            ))}
      </div>
      {filteredRows?.length === 0 ? (
        <div className="card-surface panel">
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            No initiatives found for the selected status.
          </p>
        </div>
      ) : null}
      {showModal ? (
        <div className="initiative-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="card-surface panel initiative-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="initiative-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="initiative-modal-header">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>QM Portfolio</p>
                <h2 id="initiative-modal-title">Neue Initiative</h2>
              </div>
              <button type="button" className="ghost-button" onClick={closeModal}>
                Schließen
              </button>
            </div>
            <form className="initiative-form" onSubmit={handleCreateInitiative}>
              <label className="initiative-field">
                <span>Defect-ID</span>
                <input
                  value={form.defectId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, defectId: event.target.value }))
                  }
                  placeholder="DEF-00001"
                  required
                />
              </label>
              <label className="initiative-field">
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {humanize(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="initiative-field">
                <span>Comment</span>
                <textarea
                  value={form.comment}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, comment: event.target.value }))
                  }
                  placeholder="Kurz beschreiben, was getan werden soll."
                  rows={4}
                  required
                />
              </label>
              {submitError ? (
                <p style={{ margin: 0, color: "var(--danger)" }}>{submitError}</p>
              ) : null}
              <div className="initiative-modal-actions">
                <button type="button" className="ghost-button" onClick={closeModal}>
                  Abbrechen
                </button>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                  {isSubmitting ? "Speichert..." : "Initiative anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function InitiativeCard({ row }: { row: InitiativeListItem }) {
  const date = formatDate(row.ts);
  const assigneeLabel = formatAssigneeLabel(row.user_id);

  return (
    <Link
      href={`/portfolio/initiatives/${row.action_id}`}
      className="initiative-ticket-link"
      style={{ textDecoration: "none" }}
    >
      <article
        className={`initiative-ticket initiative-change-ticket ${statusTicketClass(row.status)} ${dimensionColorClass(row.change.dimension)}`}
      >
      <header className="initiative-ticket-header">
        <p className="initiative-change-dimension">{row.change.dimensionLabel}</p>
        <div className="initiative-change-main">
          <span className="initiative-change-chip initiative-change-before">
            {row.change.before}
          </span>
          <span className="initiative-change-arrow">→</span>
          <span className="initiative-change-chip initiative-change-after">
            {row.change.after}
          </span>
        </div>
        <p className="initiative-change-evidence">{row.change.evidence ?? "Evidence pending"}</p>
      </header>
      <footer className="initiative-ticket-footer">
        <span className={statusBadgeClass(row.status)}>{formatStatusLabel(row.status)}</span>
        <span className="initiative-ticket-ref">
          {assigneeLabel} · {date} · {row.action_id}
        </span>
      </footer>
      </article>
    </Link>
  );
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
  return toTitleCase(humanize(status));
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function statusTicketClass(status: string | null) {
  if (status === "done" || status === "closed") return "initiative-ticket-done";
  if (status === "in_progress") return "initiative-ticket-in-progress";
  if (status === "assigned") return "initiative-ticket-assigned";
  if (status === "proposed_fix") return "initiative-ticket-proposed-fix";
  if (status === "open") return "initiative-ticket-open";
  return "initiative-ticket-neutral";
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

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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

function InitiativeKpiTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="metric-card initiative-kpi-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
