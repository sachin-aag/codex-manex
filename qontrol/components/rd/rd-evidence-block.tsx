"use client";

import type {
  BomPartRow,
  ClaimLagRow,
  DefectHistoryRow,
  SupplierBatchRow,
} from "@/lib/db/rd";

import { OriginBadge } from "./spine-chip-bar";
import { useSpineRowProps } from "./spine-hover-context";

type CrossExposure = {
  article_id: string;
  article_name: string | null;
  occurrences: number;
  find_numbers: string[];
};

type Props = {
  spine: { part: string; product: string; articleId: string; caseId: string };
  inFactoryHistory: DefectHistoryRow[];
  claimHistory: ClaimLagRow[];
  bomOnThisProduct: BomPartRow[];
  supplierBatch: SupplierBatchRow | null;
  crossExposure: CrossExposure[];
};

function lagBucketFor(days: number | null): string {
  if (days === null || days === undefined) return "?";
  if (days < 28) return "0-4 wk";
  if (days < 56) return "4-8 wk";
  if (days < 84) return "8-12 wk";
  return "12+ wk";
}

function lagAnswer(claims: ClaimLagRow[]): { kind: "is-yes" | "is-no" | "is-neutral"; text: string } {
  const longLag = claims.filter((c) => (c.days_from_build ?? 0) > 56).length;
  if (claims.length === 0) return { kind: "is-neutral", text: "No claims on this part yet." };
  if (longLag >= Math.max(1, claims.length * 0.3)) {
    return { kind: "is-yes", text: `${longLag}/${claims.length} claims > 8 wk lag — latent design signal.` };
  }
  return { kind: "is-neutral", text: `Most claims early (${claims.length - longLag}/${claims.length} < 8 wk).` };
}

function factoryAnswer(history: DefectHistoryRow[]): { kind: "is-yes" | "is-no" | "is-neutral"; text: string } {
  if (history.length === 0) {
    return { kind: "is-no", text: "No factory defects on this part — design-gap smell." };
  }
  if (history.length >= 3) {
    return { kind: "is-yes", text: `${history.length} factory defects — factory catches it too.` };
  }
  return { kind: "is-neutral", text: `${history.length} factory defect(s) recorded.` };
}

export function RdEvidenceBlock({
  spine,
  inFactoryHistory,
  claimHistory,
  bomOnThisProduct,
  supplierBatch,
  crossExposure,
}: Props) {
  const factory = factoryAnswer(inFactoryHistory);
  const lag = lagAnswer(claimHistory);
  const installedBatch = bomOnThisProduct[0];
  const bomFindNumber = installedBatch?.find_number ?? "-";
  const bomNode = installedBatch?.bom_node_id ?? "-";

  const batchAnswer = supplierBatch
    ? {
        kind: "is-neutral" as const,
        text: `Installed batch ${supplierBatch.batch_number} (supplier ${supplierBatch.supplier_name}). Ask SCM to confirm block status.`,
      }
    : installedBatch
    ? { kind: "is-neutral" as const, text: `BOM says batch ${installedBatch.batch_id}. No supplier_batch row found.` }
    : { kind: "is-no" as const, text: "No installed-batch info on this product. Cannot rule out batch cause." };

  const crossArticleAnswer = {
    kind: crossExposure.length > 1 ? ("is-yes" as const) : ("is-neutral" as const),
    text:
      crossExposure.length === 0
        ? "No cross-article BOM exposure found."
        : crossExposure.length === 1
        ? `Used only on ${crossExposure[0].article_id} (${crossExposure[0].occurrences} positions).`
        : `Used on ${crossExposure.length} articles — recall scope wider than one ticket.`,
  };

  return (
    <section className="card-surface rd-panel--anchored">
      <div className="rd-panel-header">
        <div>
          <h3>Evidence — is this design?</h3>
          <p>Four cross-dept reads, all anchored on <code>{spine.part}</code> / <code>{spine.product}</code>.</p>
        </div>
        <OriginBadge value={spine.part} />
      </div>
      <div style={{ padding: "0 18px 18px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <EvidenceCard
          label="QE"
          title="In-factory history on same part"
          answer={factory}
        >
          {inFactoryHistory.length > 0 ? (
            <div>
              {inFactoryHistory.slice(0, 5).map((d) => (
                <FactoryDefectRow key={d.defect_id} defect={d} part={spine.part} />
              ))}
            </div>
          ) : (
            <p className="rd-empty" style={{ padding: 0 }}>
              No matching defect rows.
            </p>
          )}
        </EvidenceCard>

        <EvidenceCard
          label="CS"
          title="Time-lag pattern (0-12+ wk)"
          answer={lag}
        >
          {claimHistory.length > 0 ? (
            <div>
              {claimHistory.slice(0, 5).map((c) => (
                <ClaimLagMiniRow key={c.field_claim_id} claim={c} />
              ))}
            </div>
          ) : (
            <p className="rd-empty" style={{ padding: 0 }}>
              No matching claims.
            </p>
          )}
        </EvidenceCard>

        <EvidenceCard
          label="SCM"
          title="Bad batch excluded?"
          answer={batchAnswer}
        >
          <dl className="rd-kv-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr" }}>
            <div className="rd-kv">
              <dt>installed_batch</dt>
              <dd>{installedBatch?.batch_number ?? "-"}</dd>
            </div>
            <div className="rd-kv">
              <dt>supplier</dt>
              <dd>{supplierBatch?.supplier_name ?? installedBatch?.supplier_name ?? "-"}</dd>
            </div>
            <div className="rd-kv">
              <dt>received_date</dt>
              <dd>
                {supplierBatch?.received_date
                  ? new Date(supplierBatch.received_date).toLocaleDateString()
                  : "-"}
              </dd>
            </div>
            <div className="rd-kv">
              <dt>batch_qty</dt>
              <dd>{supplierBatch?.qty ?? "-"}</dd>
            </div>
          </dl>
        </EvidenceCard>

        <EvidenceCard
          label="Prod"
          title="Cross-article BOM exposure"
          answer={crossArticleAnswer}
        >
          {crossExposure.length === 0 ? (
            <p className="rd-empty" style={{ padding: 0 }}>
              Part not found in any BOM.
            </p>
          ) : (
            <div>
              {crossExposure.slice(0, 6).map((x) => (
                <CrossExposureRow key={x.article_id} row={x} />
              ))}
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                find_number on this product: <code>{bomFindNumber}</code> · node <code>{bomNode}</code>
              </div>
            </div>
          )}
        </EvidenceCard>
      </div>
    </section>
  );
}

function EvidenceCard({
  label,
  title,
  answer,
  children,
}: {
  label: string;
  title: string;
  answer: { kind: "is-yes" | "is-no" | "is-neutral"; text: string };
  children: React.ReactNode;
}) {
  return (
    <div
      className="card-surface rd-panel--anchored"
      style={{ boxShadow: "none", padding: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <small
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.06,
            color: "var(--rd-accent-strong)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </small>
      </div>
      <h4 style={{ margin: "2px 0 10px", fontSize: 13 }}>{title}</h4>
      <p className={`rd-evidence-answer ${answer.kind}`}>{answer.text}</p>
      {children}
    </div>
  );
}

function FactoryDefectRow({ defect, part }: { defect: DefectHistoryRow; part: string }) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({
    part,
    articleId: defect.article_id,
  });
  return (
    <div
      className={`rd-row ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ gridTemplateColumns: "90px 1fr 80px", fontSize: 12 }}
    >
      <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--rd-accent-strong)" }}>
        {defect.defect_id}
      </strong>
      <span>
        {defect.defect_code ?? "?"} ·{" "}
        <small style={{ color: "var(--text-muted)" }}>{defect.article_name}</small>
      </span>
      <small>{new Date(defect.defect_ts).toLocaleDateString()}</small>
    </div>
  );
}

function ClaimLagMiniRow({ claim }: { claim: ClaimLagRow }) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({
    part: claim.reported_part_number ?? undefined,
    articleId: claim.article_id,
    caseId: claim.field_claim_id,
  });
  return (
    <div
      className={`rd-row ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ gridTemplateColumns: "90px 60px 1fr 40px", fontSize: 12 }}
    >
      <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--rd-accent-strong)" }}>
        {claim.field_claim_id}
      </strong>
      <span>{lagBucketFor(claim.days_from_build)}</span>
      <span style={{ color: "var(--text-secondary)" }}>{claim.market ?? "-"}</span>
      <small>{claim.days_from_build ?? "-"}d</small>
    </div>
  );
}

function CrossExposureRow({ row }: { row: CrossExposure }) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({
    articleId: row.article_id,
  });
  return (
    <div
      className={`rd-row ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ gridTemplateColumns: "100px 1fr 50px", fontSize: 12 }}
    >
      <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--rd-accent-strong)" }}>
        {row.article_id}
      </strong>
      <span>{row.article_name ?? "(no name)"}</span>
      <small>{row.occurrences}</small>
    </div>
  );
}
