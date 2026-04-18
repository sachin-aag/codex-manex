"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RecallOption = { article_id: string; article_name: string | null; occurrences: number };

type Props = {
  caseId: string;
  partNumber: string;
  recallOptions: RecallOption[];
};

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function RdDecisionForm({ caseId, partNumber, recallOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<Status>({ kind: "idle" });

  const [outcome, setOutcome] = useState<"proposed_fix" | "acknowledged" | "rejected">("proposed_fix");
  const [classification, setClassification] = useState<"design" | "not_design">("design");
  const [proposedFixType, setProposedFixType] = useState<"spec_change" | "part_change" | "no_action">(
    "spec_change",
  );
  const [recallScope, setRecallScope] = useState<string[]>([]);
  const [note, setNote] = useState<string>(
    `Reviewing ${partNumber} for ${caseId}. Design review opened.`,
  );

  function toggleRecall(id: string) {
    setRecallScope((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "pending" });
    try {
      const res = await fetch("/api/rd/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          outcome,
          classification: outcome === "rejected" ? "not_design" : classification,
          proposedFixType: outcome === "proposed_fix" ? proposedFixType : undefined,
          recallScope: outcome === "proposed_fix" ? recallScope : [],
          note,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: payload?.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "success" });
      startTransition(() => router.refresh());
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const disabled = state.kind === "pending" || isPending;

  return (
    <form className="rd-action-form" onSubmit={handleSubmit}>
      <div>
        <div className="rd-radio-row">
          <label>
            <input
              type="radio"
              name="outcome"
              checked={outcome === "proposed_fix"}
              onChange={() => setOutcome("proposed_fix")}
              disabled={disabled}
            />
            Propose fix
            <small style={{ display: "block", fontWeight: 400, color: "var(--text-secondary)", marginLeft: 24, fontSize: 11 }}>
              Design fix + scope → QM verify
            </small>
          </label>
          <label>
            <input
              type="radio"
              name="outcome"
              checked={outcome === "acknowledged"}
              onChange={() => setOutcome("acknowledged")}
              disabled={disabled}
            />
            Acknowledge
            <small style={{ display: "block", fontWeight: 400, color: "var(--text-secondary)", marginLeft: 24, fontSize: 11 }}>
              Keep open, log intent
            </small>
          </label>
          <label>
            <input
              type="radio"
              name="outcome"
              checked={outcome === "rejected"}
              onChange={() => setOutcome("rejected")}
              disabled={disabled}
            />
            Not design
            <small style={{ display: "block", fontWeight: 400, color: "var(--text-secondary)", marginLeft: 24, fontSize: 11 }}>
              Bounce back to QM
            </small>
          </label>
        </div>
      </div>

      {outcome === "proposed_fix" && (
        <>
          <label>
            Classification
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as typeof classification)}
              disabled={disabled}
            >
              <option value="design">Design weakness</option>
              <option value="not_design">Not a design issue (supplier / process / handling)</option>
            </select>
          </label>

          <label>
            Proposed fix type
            <select
              value={proposedFixType}
              onChange={(e) => setProposedFixType(e.target.value as typeof proposedFixType)}
              disabled={disabled}
            >
              <option value="spec_change">Spec change (drawing / tolerance)</option>
              <option value="part_change">Part change (different component)</option>
              <option value="no_action">No action (monitor only)</option>
            </select>
          </label>

          {recallOptions.length > 0 && (
            <label>
              Recall / redesign scope (articles using {partNumber})
              <div className="rd-checkbox-list">
                {recallOptions.map((opt) => (
                  <label key={opt.article_id}>
                    <input
                      type="checkbox"
                      checked={recallScope.includes(opt.article_id)}
                      onChange={() => toggleRecall(opt.article_id)}
                      disabled={disabled}
                    />
                    {opt.article_id}
                    <small style={{ color: "var(--text-muted)", marginLeft: 4, fontWeight: 400 }}>
                      · {opt.article_name ?? "(no name)"} · {opt.occurrences} BOM pos.
                    </small>
                  </label>
                ))}
              </div>
            </label>
          )}
        </>
      )}

      <label>
        Note for QM
        <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} />
      </label>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="primary-button" disabled={disabled || !note.trim()}>
          {disabled
            ? "Submitting…"
            : outcome === "proposed_fix"
            ? "Submit proposed fix"
            : outcome === "rejected"
            ? "Send back to QM"
            : "Log acknowledgement"}
        </button>
        {state.kind === "success" && (
          <span className="rd-action-status is-success">Decision submitted. QM notified.</span>
        )}
        {state.kind === "error" && (
          <span className="rd-action-status is-error">{state.message}</span>
        )}
        {state.kind === "idle" && (
          <span className="rd-action-status">
            Writes to <code>product_action</code> and updates <code>qontrol_case_state</code>.
          </span>
        )}
      </div>
    </form>
  );
}
