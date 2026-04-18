"use client";

import Link from "next/link";

import type { QontrolCase, TimelineEvent } from "@/lib/qontrol-data";
import type {
  BomPartRow,
  ClaimLagRow,
  DefectHistoryRow,
  ProductActionRow,
  SupplierBatchRow,
} from "@/lib/db/rd";

import { SpineHoverProvider } from "./spine-hover-context";
import { SpineChipBar } from "./spine-chip-bar";
import { RdEvidenceBlock } from "./rd-evidence-block";
import { RdDecisionForm } from "./rd-decision-form";

type Props = {
  kase: QontrolCase;
  inFactoryHistory: DefectHistoryRow[];
  claimHistory: ClaimLagRow[];
  bomOnThisProduct: BomPartRow[];
  supplierBatch: SupplierBatchRow | null;
  crossExposure: {
    article_id: string;
    article_name: string | null;
    occurrences: number;
    find_numbers: string[];
  }[];
  decisions: ProductActionRow[];
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function severityBadgeClass(sev: string): string {
  if (sev === "high") return "badge badge-danger";
  if (sev === "medium") return "badge badge-warning";
  return "badge badge-success";
}

function stateBadge(state: string): { label: string; className: string } {
  const labels: Record<string, { label: string; className: string }> = {
    unassigned: { label: "Unassigned", className: "badge badge-warning" },
    assigned: { label: "With R&D", className: "badge badge-story" },
    returned_to_qm_for_verification: {
      label: "Awaiting QM verify",
      className: "badge badge-success",
    },
    closed: { label: "Closed", className: "badge badge-neutral" },
  };
  return labels[state] ?? { label: state, className: "badge badge-neutral" };
}

export function RdTicket(props: Props) {
  return (
    <SpineHoverProvider>
      <RdTicketInner {...props} />
    </SpineHoverProvider>
  );
}

function RdTicketInner({
  kase,
  inFactoryHistory,
  claimHistory,
  bomOnThisProduct,
  supplierBatch,
  crossExposure,
  decisions,
}: Props) {
  const spine = {
    part: kase.partNumber,
    product: kase.productId,
    articleId: kase.articleId,
    caseId: kase.id,
  };

  const stateBadgeInfo = stateBadge(kase.state);

  const recallOptions = crossExposure.map((x) => ({
    article_id: x.article_id,
    article_name: x.article_name,
    occurrences: x.occurrences,
  }));

  const timeline = [
    ...kase.timeline,
    ...decisions.map<TimelineEvent>((d) => ({
      id: d.action_id,
      at: d.ts,
      title: `R&D decision: ${d.status}`,
      description: d.comments?.split(" :: ")[0] ?? d.comments ?? "",
      source: "team" as const,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <main className="page-shell" data-dept="rd">
      <SpineChipBar spine={spine} />

      <section className="hero-strip">
        <div>
          <Link href="/rd" className="rd-back-link">
            ← Back to R&D workspace
          </Link>
          <p className="eyebrow" style={{ marginTop: 10 }}>
            R&D · Single ticket
          </p>
          <h1>
            {kase.id} · {kase.title}
          </h1>
          <p className="hero-copy">{kase.summary}</p>
          <div className="rd-inline-badges">
            <span className={stateBadgeInfo.className}>{stateBadgeInfo.label}</span>
            <span className="badge badge-neutral">{kase.sourceType === "defect" ? "D" : "FC"}</span>
            <span className={severityBadgeClass(kase.severity)}>{kase.severity}</span>
            <span className="badge badge-neutral">{kase.market}</span>
            <span className="badge badge-story">Story: {kase.story}</span>
          </div>
        </div>
      </section>

      <section className="card-surface">
        <div className="rd-panel-header">
          <div>
            <h3>From ticket</h3>
            <p>Raw fields R&D needs from the source row.</p>
          </div>
        </div>
        <dl className="rd-kv-grid">
          <div className="rd-kv">
            <dt>reported_part_number</dt>
            <dd>{kase.partNumber}</dd>
          </div>
          <div className="rd-kv">
            <dt>article_id</dt>
            <dd>
              {kase.articleId} · <small style={{ color: "var(--text-muted)" }}>{kase.title}</small>
            </dd>
          </div>
          <div className="rd-kv">
            <dt>product_id</dt>
            <dd>{kase.productId}</dd>
          </div>
          <div className="rd-kv">
            <dt>find_number</dt>
            <dd>{bomOnThisProduct[0]?.find_number ?? "-"}</dd>
          </div>
          <div className="rd-kv">
            <dt>bom_node</dt>
            <dd>{bomOnThisProduct[0]?.bom_node_id ?? "-"}</dd>
          </div>
          <div className="rd-kv">
            <dt>severity · market</dt>
            <dd>
              {kase.severity} · {kase.market}
            </dd>
          </div>
          {kase.sourceType === "claim" && (
            <>
              <div className="rd-kv" style={{ gridColumn: "span 2" }}>
                <dt>complaint_text</dt>
                <dd style={{ fontFamily: "var(--font-sans)" }}>{kase.summary}</dd>
              </div>
              <div className="rd-kv">
                <dt>days_from_build</dt>
                <dd>
                  {claimHistory.find((c) => c.field_claim_id === kase.id)?.days_from_build ?? "-"}
                </dd>
              </div>
            </>
          )}
        </dl>
        {kase.summary && kase.sourceType === "defect" && (
          <>
            <h4 className="rd-section-title" style={{ marginTop: 6 }}>
              Notes
            </h4>
            <p className="rd-complaint">{kase.summary}</p>
          </>
        )}
      </section>

      <div className="rd-grid top-gap">
        <div className="stack-list">
          <RdEvidenceBlock
            spine={spine}
            inFactoryHistory={inFactoryHistory}
            claimHistory={claimHistory}
            bomOnThisProduct={bomOnThisProduct}
            supplierBatch={supplierBatch}
            crossExposure={crossExposure}
          />

          <section className="card-surface">
            <div className="rd-panel-header">
              <div>
                <h3>Decision workspace</h3>
                <p>Write back to QM. Response becomes a product_action + case-state flip.</p>
              </div>
            </div>
            <RdDecisionForm
              caseId={kase.id}
              partNumber={kase.partNumber}
              recallOptions={recallOptions}
            />
          </section>
        </div>

        <div className="stack-list">
          <section className="card-surface">
            <div className="rd-panel-header">
              <div>
                <h3>Routing context</h3>
                <p>Why QM sent this to R&D.</p>
              </div>
            </div>
            <div style={{ padding: "0 18px 14px" }}>
              <ul className="rd-list">
                {kase.routingWhy.map((r, i) => (
                  <li key={i}>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                <strong>Containment ask: </strong>
                {kase.requestedAction.containment}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                <strong>Permanent-fix ask: </strong>
                {kase.requestedAction.permanentFix}
              </div>
            </div>
          </section>

          <section className="card-surface">
            <div className="rd-panel-header">
              <div>
                <h3>Timeline</h3>
                <p>QM hand-off + R&D decisions on this case.</p>
              </div>
            </div>
            {timeline.length === 0 ? (
              <p className="rd-empty">No events yet.</p>
            ) : (
              <ul className="rd-list" style={{ padding: "0 18px 14px" }}>
                {timeline.map((t) => (
                  <li key={t.id}>
                    <span>
                      <strong>{t.title}</strong>
                      {t.description ? (
                        <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                          {t.description.length > 120 ? `${t.description.slice(0, 120)}…` : t.description}
                        </div>
                      ) : null}
                    </span>
                    <small>{fmt(t.at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
