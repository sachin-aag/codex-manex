"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  BriefingActionRequiredItem,
  BriefingNextStepItem,
  BriefingPatternItem,
  QualityBriefingPayload,
} from "@/lib/quality-briefing/briefing-types";

type ApiSuccess = {
  briefing: QualityBriefingPayload;
  generatedAt: string;
  model?: string;
};

type ApiErrorJson = {
  error?: string;
  details?: string;
  raw?: string;
};

const ID_PATTERN =
  /\b(DEF-[0-9]{5}|PRD-[0-9]{5}|FC-[0-9]{5}|TR-[0-9]{6})\b/g;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Qontrol case ids are defect_id (DEF-*) and field_claim_id (FC-*); `/?case=` opens the ticket on the home board. */
function hrefForId(id: string): string {
  if (id.startsWith("PA-")) return "/portfolio/initiatives";
  if (id.startsWith("DEF-") || id.startsWith("FC-")) {
    return `/?case=${encodeURIComponent(id)}`;
  }
  return "/portfolio";
}

function IdLink({ id }: { id: string }) {
  return (
    <Link href={hrefForId(id)} className="briefing-id-link">
      {id}
    </Link>
  );
}

function linkifyIds(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  const re = new RegExp(ID_PATTERN.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={`t-${key++}`}>{text.slice(last, m.index)}</span>,
      );
    }
    const id = m[0];
    out.push(<IdLink key={`l-${key++}`} id={id} />);
    last = m.index + id.length;
  }
  if (last < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }
  return out;
}

function severityBadgeClass(sev: string): string {
  const s = sev.toLowerCase();
  if (s === "critical") return "briefing-badge briefing-badge-critical";
  if (s === "high") return "briefing-badge briefing-badge-high";
  if (s === "medium") return "briefing-badge briefing-badge-medium";
  if (s === "low") return "briefing-badge briefing-badge-low";
  return "briefing-badge briefing-badge-muted";
}

function priorityBadgeClass(p: string): string {
  const x = p.toLowerCase();
  if (x === "high") return "briefing-badge briefing-badge-priority-high";
  if (x === "medium") return "briefing-badge briefing-badge-priority-medium";
  if (x === "low") return "briefing-badge briefing-badge-priority-low";
  return "briefing-badge briefing-badge-muted";
}

function sortActions(rows: BriefingActionRequiredItem[]): BriefingActionRequiredItem[] {
  return [...rows].sort((a, b) => {
    const sa =
      SEVERITY_ORDER[(a.severity ?? "").toLowerCase()] ?? 99;
    const sb =
      SEVERITY_ORDER[(b.severity ?? "").toLowerCase()] ?? 99;
    if (sa !== sb) return sa - sb;
    return (b.age_days ?? 0) - (a.age_days ?? 0);
  });
}

function sortSteps(rows: BriefingNextStepItem[]): BriefingNextStepItem[] {
  return [...rows].sort((a, b) => {
    const pa =
      PRIORITY_ORDER[(a.priority ?? "").toLowerCase()] ?? 99;
    const pb =
      PRIORITY_ORDER[(b.priority ?? "").toLowerCase()] ?? 99;
    return pa - pb;
  });
}

export function QualityBriefingPanel() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiSuccess | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(() => new Set());

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/quality-briefing", { method: "POST" });
      const json = (await res.json()) as ApiSuccess & ApiErrorJson;
      if (!res.ok) {
        setData(null);
        const detail =
          json.details ?? json.error ?? json.raw ?? `HTTP ${res.status}`;
        setErr(
          typeof detail === "string"
            ? detail
            : "Briefing request failed",
        );
        return;
      }
      if (!json.briefing) {
        setData(null);
        setErr("Invalid response: missing briefing");
        return;
      }
      setData({
        briefing: json.briefing,
        generatedAt: json.generatedAt,
        model: json.model,
      });
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    setCheckedSteps(new Set());
  }, [data?.generatedAt]);

  const sortedActions = useMemo(
    () =>
      data?.briefing?.action_required
        ? sortActions(data.briefing.action_required)
        : [],
    [data],
  );

  const sortedSteps = useMemo(
    () =>
      data?.briefing?.next_steps ? sortSteps(data.briefing.next_steps) : [],
    [data],
  );

  const toggleStep = useCallback((displayIndex: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(displayIndex)) next.delete(displayIndex);
      else next.add(displayIndex);
      return next;
    });
  }, []);

  return (
    <section className="pf-section briefing-embed" aria-label="AI quality briefing">
      <div className="briefing-embed-header">
        <div>
          <h2 className="briefing-embed-title">AI Quality Manager briefing</h2>
          <p className="chart-desc briefing-embed-desc">
            Live summary of quality themes. Regenerate anytime; tap an ID to open
            the related portfolio view.
          </p>
        </div>
        <div className="briefing-actions">
          <button
            type="button"
            className="briefing-regen-btn"
            onClick={() => void run()}
            disabled={loading}
          >
            {loading ? "Generating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="card-surface panel briefing-error" role="alert">
          <p>{err}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="briefing-loading card-surface panel">
          <p>Loading quality data and calling the model…</p>
          <div className="pf-skeleton" style={{ height: 120, marginTop: 16 }} />
        </div>
      ) : null}

      {data?.generatedAt && !loading ? (
        <p className="briefing-timestamp">
          Generated at{" "}
          {new Date(data.generatedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {data.model ? (
            <>
              {" "}
              · Model <code className="kpi-code">{data.model}</code>
            </>
          ) : null}
        </p>
      ) : null}

      {data?.briefing && !loading ? (
        <>
          <div className="briefing-grid">
            <div className="briefing-pane card-surface panel">
              <h3 className="briefing-pane-title">Action required</h3>
              <p className="briefing-pane-sub">
                Critical defects and stale or urgent actions
              </p>
              {sortedActions.length === 0 ? (
                <p className="briefing-empty">No items in this category.</p>
              ) : (
                <div className="briefing-table-wrap briefing-pane-scroll">
                  <table className="briefing-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Product</th>
                        <th>Issue</th>
                        <th>Age / priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedActions.map((row, i) => (
                        <tr key={`${row.id}-${i}`}>
                          <td>
                            {/\b(DEF|PA|FC|TR)-/.test(row.id) ? (
                              <IdLink id={row.id} />
                            ) : (
                              <span className="briefing-mono">{row.id}</span>
                            )}
                          </td>
                          <td className="briefing-mono">{row.product}</td>
                          <td>{row.issue}</td>
                          <td>
                            <div className="briefing-severity-age">
                              <span className={severityBadgeClass(row.severity)}>
                                {row.severity}
                              </span>
                              <span className="briefing-age">
                                {row.age_days}d
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="briefing-pane card-surface panel">
              <h3 className="briefing-pane-title">Patterns and trends</h3>
              <p className="briefing-pane-sub">
                Recurring codes, products, and trend notes
              </p>
              {data.briefing.patterns.length === 0 ? (
                <p className="briefing-empty">No patterns highlighted.</p>
              ) : (
                <div className="briefing-pane-scroll">
                  <ul className="briefing-pattern-list">
                  {data.briefing.patterns.map((p: BriefingPatternItem, i) => (
                    <li key={`${p.defect_type}-${i}`} className="briefing-pattern-item">
                      <div className="briefing-pattern-head">
                        <span className="briefing-mono briefing-pattern-code">
                          {p.defect_type}
                        </span>
                        <span className="briefing-badge briefing-badge-count">
                          {p.count}
                        </span>
                      </div>
                      {p.affected_products?.length ? (
                        <p className="briefing-pattern-products">
                          {p.affected_products.join(", ")}
                        </p>
                      ) : null}
                      {p.trend ? (
                        <p className="briefing-pattern-trend">{p.trend}</p>
                      ) : null}
                    </li>
                  ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="briefing-pane card-surface panel">
              <h3 className="briefing-pane-title">Progress and wins</h3>
              <p className="briefing-pane-sub">What is going well</p>
              {data.briefing.progress.length === 0 ? (
                <p className="briefing-empty">No positive signals listed.</p>
              ) : (
                <div className="briefing-pane-scroll">
                  <ul className="briefing-progress-list">
                  {data.briefing.progress.map((line, i) => (
                    <li key={i} className="briefing-progress-item">
                      {linkifyIds(line)}
                    </li>
                  ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="briefing-next-steps card-surface panel">
            <h3 className="briefing-pane-title">Recommended next steps</h3>
            <p className="briefing-pane-sub">
              Check off items as you address them (stored in this session only).
            </p>
            {sortedSteps.length === 0 ? (
              <p className="briefing-empty">No next steps suggested.</p>
            ) : (
              <ul className="briefing-checklist">
                {sortedSteps.map((step, displayIndex) => (
                  <li
                    key={`${step.action}-${displayIndex}`}
                    className="briefing-check-row"
                  >
                    <label className="briefing-check-label">
                      <input
                        type="checkbox"
                        className="briefing-checkbox"
                        checked={checkedSteps.has(displayIndex)}
                        onChange={() => toggleStep(displayIndex)}
                      />
                      <span className="briefing-check-body">
                        <span className="briefing-check-action">{step.action}</span>
                        <span className="briefing-check-meta">
                          {step.related_ids?.length ? (
                            <span className="briefing-check-ids">
                              {step.related_ids.map((id, j) => (
                                <span key={`${id}-${j}`} className="briefing-id-inline">
                                  {j > 0 ? " · " : null}
                                  <IdLink id={id} />
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {step.suggested_owner ? (
                            <span className="briefing-owner-chip">
                              {step.suggested_owner}
                            </span>
                          ) : null}
                          <span
                            className={priorityBadgeClass(step.priority ?? "")}
                          >
                            {step.priority}
                          </span>
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
