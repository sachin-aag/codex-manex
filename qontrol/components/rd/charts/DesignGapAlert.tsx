"use client";

import Link from "next/link";

import type { ClaimLagRow } from "@/lib/db/rd";

import { useSpineRowProps } from "../spine-hover-context";

type Props = {
  gapFcs: ClaimLagRow[];
  maxRows?: number;
};

function GapAlertRow({ claim }: { claim: ClaimLagRow }) {
  const { onMouseEnter, onMouseLeave, linkedClass } = useSpineRowProps({
    part: claim.reported_part_number,
    articleId: claim.article_id,
    caseId: claim.field_claim_id,
  });
  return (
    <Link
      href={`/rd/${claim.field_claim_id}`}
      className={`rd-alert-row rd-row-link ${linkedClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="rd-alert-row-id">{claim.field_claim_id}</span>
      <span className="rd-alert-row-meta">
        <span className="rd-alert-row-part">{claim.reported_part_number ?? "—"}</span>
        <span className="rd-alert-row-product">{claim.product_id}</span>
        <span className="rd-alert-row-article">{claim.article_name ?? claim.article_id}</span>
      </span>
      <span className="rd-alert-row-lag">{claim.days_from_build ?? "—"}d</span>
    </Link>
  );
}

export function DesignGapAlert({ gapFcs, maxRows = 6 }: Props) {
  const shown = gapFcs.slice(0, maxRows);

  if (shown.length === 0) {
    return (
      <div className="rd-alert-card rd-alert-card--ok">
        <div className="rd-alert-card-head">
          <span className="rd-alert-icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
          <div>
            <strong className="rd-alert-title">No design-gap signal</strong>
            <p className="rd-alert-sub">Every sampled part has at least one factory defect on record.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rd-alert-card rd-alert-card--warn">
      <div className="rd-alert-card-head">
        <span className="rd-alert-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div>
          <strong className="rd-alert-title">
            {gapFcs.length} design-gap field claim{gapFcs.length === 1 ? "" : "s"}
          </strong>
          <p className="rd-alert-sub">
            No matching factory defect on the same part — investigate as potential design gap.
          </p>
        </div>
      </div>
      <div className="rd-alert-rows">
        {shown.map((c) => (
          <GapAlertRow key={c.field_claim_id} claim={c} />
        ))}
      </div>
      {gapFcs.length > maxRows ? (
        <p className="rd-alert-more">+{gapFcs.length - maxRows} more — use the signal filter to review all.</p>
      ) : null}
    </div>
  );
}
