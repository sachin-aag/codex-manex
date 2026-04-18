export type ChangeDimension =
  | "supplier"
  | "part"
  | "process"
  | "parameter"
  | "ownership"
  | "unknown";

export type InitiativeChange = {
  dimension: ChangeDimension;
  dimensionLabel: string;
  before: string;
  after: string;
  evidence?: string;
};

export type InitiativeChangeContext = {
  action_type: string | null;
  status: string | null;
  user_id?: string | null;
  comments?: string | null;
  defect_id?: string | null;
};

export type DefectChangeContext = {
  defect_code?: string | null;
  product_id?: string | null;
  reported_part_title?: string | null;
  reported_part_number?: string | null;
};

export type ClaimChangeContext = {
  field_claim_id?: string;
};

export type BomChangeContext = {
  supplier_name?: string | null;
  supplier_batch?: string | null;
  part_title?: string | null;
  part_number?: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function title(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseCommentHints(comment: string | null | undefined) {
  const raw = clean(comment);
  const lowered = raw.toLowerCase();
  return {
    raw,
    lowered,
    mentionsSupplier:
      lowered.includes("supplier") ||
      lowered.includes("batch") ||
      lowered.includes("re-qual") ||
      lowered.includes("requal"),
    mentionsDesign:
      lowered.includes("design") ||
      lowered.includes("bom") ||
      lowered.includes("part"),
    mentionsProcess:
      lowered.includes("line") ||
      lowered.includes("process") ||
      lowered.includes("work instruction") ||
      lowered.includes("containment"),
    newOwner:
      /assigned\s+to\s+([a-z0-9 _.-]+)/i.exec(raw)?.[1]?.trim() ??
      /owner\s*[:=]\s*([a-z0-9 _.-]+)/i.exec(raw)?.[1]?.trim() ??
      "",
  };
}

export function dimensionColorClass(dimension: ChangeDimension) {
  if (dimension === "supplier") return "change-supplier";
  if (dimension === "part") return "change-part";
  if (dimension === "process") return "change-process";
  if (dimension === "parameter") return "change-parameter";
  if (dimension === "ownership") return "change-ownership";
  return "change-unknown";
}

export function extractChange(
  initiative: InitiativeChangeContext,
  defectDetail: DefectChangeContext | null,
  claimDetails: ClaimChangeContext[],
  bomContext: BomChangeContext | null,
  evidenceCounts?: { defects?: number; claims?: number },
): InitiativeChange {
  const actionType = clean(initiative.action_type).toLowerCase();
  const hints = parseCommentHints(initiative.comments);
  const supplierName = clean(bomContext?.supplier_name);
  const supplierBatch = clean(bomContext?.supplier_batch);
  const partTitle =
    clean(defectDetail?.reported_part_title) ||
    clean(bomContext?.part_title) ||
    clean(bomContext?.part_number) ||
    clean(defectDetail?.reported_part_number);

  const defectCode = clean(defectDetail?.defect_code);
  const defectsCount = evidenceCounts?.defects ?? (defectDetail ? 1 : 0);
  const claimsCount = evidenceCounts?.claims ?? claimDetails.length;
  const evidenceParts: string[] = [];
  if (defectsCount > 0) evidenceParts.push(`${defectsCount} Defekte`);
  if (claimsCount > 0) evidenceParts.push(`${claimsCount} Field Claims`);
  const evidence = evidenceParts.length ? `${evidenceParts.join(" · ")} betroffen` : undefined;

  if (actionType === "assignment") {
    const afterOwner = hints.newOwner || clean(initiative.user_id) || "Assigned owner";
    return {
      dimension: "ownership",
      dimensionLabel: "Ownership Change",
      before: "Unassigned",
      after: title(afterOwner),
      evidence,
    };
  }

  if (
    (actionType === "corrective" || actionType === "corrective_action") &&
    (hints.mentionsSupplier || supplierName || supplierBatch)
  ) {
    const before = [supplierName || "Unknown supplier", supplierBatch].filter(Boolean).join(" · ");
    return {
      dimension: "supplier",
      dimensionLabel: "Supplier Change",
      before: before || "Supplier batch in use",
      after: "Batch blockiert · Re-qualify läuft",
      evidence,
    };
  }

  if (actionType === "design_decision" || hints.mentionsDesign) {
    return {
      dimension: "part",
      dimensionLabel: "BOM Update",
      before: partTitle || "Current part setup",
      after: hints.raw ? title(hints.raw.slice(0, 80)) : "Design-Review läuft",
      evidence,
    };
  }

  if (actionType === "preventive" || actionType === "containment" || hints.mentionsProcess) {
    return {
      dimension: "process",
      dimensionLabel: "Process Change",
      before: "Aktueller Prozess",
      after: hints.raw ? title(hints.raw.slice(0, 80)) : "Containment aktiv",
      evidence,
    };
  }

  return {
    dimension: "unknown",
    dimensionLabel: "Change in Progress",
    before: defectCode ? `Issue: ${defectCode}` : title(actionType || "initiative"),
    after: `Update active (${title(actionType || "change")})`,
    evidence,
  };
}

