import {
  type CaseState,
  type Clarity,
  type ProposedFix,
  type QontrolCase,
  type Severity,
  type StoryKey,
  type StoryVisualization,
  type TeamTicket,
  type TriageContext,
  type TimelineEvent,
} from "@/lib/qontrol-data";
import {
  addIssueToGitHubProject,
  createGitHubIssue,
  getGitHubConfig,
  getGitHubIssue,
  getGitHubProjectUrl,
  updateGitHubIssue,
} from "@/lib/github";
import { postgrestRequest } from "@/lib/db/postgrest";

type DefectRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string | null;
  source_type: string | null;
  defect_code: string | null;
  severity: string | null;
  detected_section_name: string | null;
  occurrence_section_name: string | null;
  reported_part_number: string | null;
  image_url: string | null;
  cost: number | null;
  notes: string | null;
  article_id: string;
  article_name: string | null;
};

type ClaimRow = {
  field_claim_id: string;
  product_id: string;
  claim_ts: string | null;
  market: string | null;
  complaint_text: string | null;
  reported_part_number: string | null;
  cost: number | null;
  mapped_defect_id: string | null;
  mapped_defect_code: string | null;
  mapped_defect_severity: string | null;
  notes: string | null;
  article_id: string;
  article_name: string | null;
  days_from_build: number | null;
};

type CaseStateRow = {
  case_id: string;
  source_type: "defect" | "claim";
  source_row_id: string;
  product_id: string;
  defect_id: string | null;
  current_state: CaseState;
  assignee: string | null;
  owner_team: string | null;
  qm_owner: string | null;
  state_history: StateHistoryEntry[] | null;
  external_ticket?: TeamTicket | null;
  updated_at: string;
};

type ProductRow = {
  product_id: string;
  order_id: string | null;
  bom_id: string | null;
  build_ts: string | null;
};

type ReworkSummaryRow = {
  product_id: string;
  user_id: string | null;
  action_text: string | null;
};

type SupplierBatchRow = {
  batch_id: string;
  part_number: string;
  supplier_name: string | null;
  received_date: string | null;
};

type BomNodeRow = {
  bom_id: string;
  bom_node_id: string;
  parent_bom_node_id: string | null;
  part_number: string | null;
  node_type: string | null;
  find_number: string | null;
};

type ProductActionRow = {
  action_id: string;
  product_id: string;
  ts: string | null;
  action_type: string | null;
  status: string | null;
  user_id: string | null;
  section_id: string | null;
  comments: string | null;
  defect_id: string | null;
};

type StateHistoryEntry = {
  id: string;
  state: CaseState;
  at: string;
  actor: string;
  note: string;
};

const DEFAULT_QM_OWNER = "Nina Becker";
const DEFAULT_CS_OWNER = "Lea Winter";
const DEFAULT_USER = "qontrol";

const ownerAssigneeByStory: Record<StoryKey, string> = {
  supplier: "Mira Vogel",
  process: "Tobias Kern",
  design: "Sofia Lange",
  handling: "Jonas Frei",
};

const ownerTeamByStory: Record<StoryKey, string> = {
  supplier: "Supply Chain",
  process: "Manufacturing / Process",
  design: "R&D",
  handling: "Manufacturing / Process",
};

const teamEmailByStory: Record<StoryKey, string> = {
  supplier: "supply-chain@manex.internal",
  process: "manufacturing-process@manex.internal",
  design: "rd-reliability@manex.internal",
  handling: "manufacturing-process@manex.internal",
};

const managerByStory: Record<StoryKey, { name: string; email: string }> = {
  supplier: { name: "Dr. Frank Richter", email: "frank.richter@manex.internal" },
  process: { name: "Claudia Steiner", email: "claudia.steiner@manex.internal" },
  design: { name: "Prof. Martin Holz", email: "martin.holz@manex.internal" },
  handling: { name: "Claudia Steiner", email: "claudia.steiner@manex.internal" },
};

function toSeverity(value: string | null): Severity {
  if (value === "high" || value === "medium" || value === "low") return value;
  if (value === "critical") return "high";
  return "medium";
}

function classifyStory(params: {
  sourceType: "defect" | "claim";
  defectCode: string | null;
  articleId: string;
  partNumber: string | null;
}): StoryKey {
  if (params.defectCode === "SOLDER_COLD" || params.partNumber === "PM-00008") {
    return "supplier";
  }
  if (params.defectCode === "VIB_FAIL") {
    return "process";
  }
  if (
    params.sourceType === "claim" &&
    params.articleId === "ART-00001" &&
    params.partNumber === "PM-00015"
  ) {
    return "design";
  }
  if (
    params.defectCode === "VISUAL_SCRATCH" ||
    params.defectCode === "LABEL_MISALIGN"
  ) {
    return "handling";
  }
  return "process";
}

function storySignals(story: StoryKey) {
  if (story === "supplier") {
    return {
      why: [
        "Supplier-linked pattern detected around incoming material quality.",
        "Symptoms align to the known cold-solder cohort signature.",
      ],
      containment:
        "Contain affected product cohort and verify batch exposure before release.",
      permanentFix:
        "Drive supplier corrective action and tighten incoming quality checks.",
      validation:
        "Return affected-population and retest evidence to QM for verification.",
    };
  }
  if (story === "design") {
    return {
      why: [
        "Field-only failure pattern suggests latent design weakness.",
        "Longer lag-to-failure aligns with design drift signatures.",
      ],
      containment:
        "Share customer workaround and monitor field impact while fix is validated.",
      permanentFix:
        "Validate design update and update engineering test coverage.",
      validation:
        "Provide validation report and revised test proof to QM.",
    };
  }
  if (story === "handling") {
    return {
      why: [
        "Defect pattern resembles handling/operator-driven cosmetic issues.",
        "Severity profile indicates low immediate production risk.",
      ],
      containment: "Monitor the next builds and capture order/operator linkage.",
      permanentFix:
        "If recurrence continues, enforce packaging SOP correction and retraining.",
      validation: "QM verifies recurrence drop and stable inspection outcomes.",
    };
  }
  return {
    why: [
      "Defect signature aligns with process-control drift.",
      "Containment is expected through line calibration and local controls.",
    ],
    containment: "Isolate potentially affected build window and line output.",
    permanentFix:
      "Recalibrate process tooling and update drift-prevention control limits.",
    validation:
      "Return calibration proof and post-fix test summary to QM for closure.",
  };
}

const severityResponseWindow: Record<Severity, string> = {
  high: "24 hours",
  medium: "48 hours",
  low: "5 business days",
};

function buildEmailDraft(params: {
  caseId: string;
  story: StoryKey;
  summary: string;
  severity: Severity;
  defectCode: string | null;
  productId: string;
  partNumber: string | null;
}) {
  const team = ownerTeamByStory[params.story];
  const to = [teamEmailByStory[params.story]];
  const signals = storySignals(params.story);
  const responseWindow = severityResponseWindow[params.severity];
  const subject = `[${params.severity.toUpperCase()}] ${params.caseId}: action required — ${team}`;
  const body =
    `Hi ${team} team,\n\n` +
    `QM has routed ${params.caseId} to your team for investigation and resolution.\n\n` +
    `--- Case details ---\n` +
    `Severity: ${params.severity.toUpperCase()}\n` +
    `Product: ${params.productId}\n` +
    `Part: ${params.partNumber ?? "N/A"}\n` +
    `Defect code: ${params.defectCode ?? "N/A"}\n\n` +
    `--- Summary ---\n` +
    `${params.summary}\n\n` +
    `--- Preliminary root cause analysis ---\n` +
    `${signals.why.map((line) => `• ${line}`).join("\n")}\n\n` +
    `--- Expected response ---\n` +
    `Given the ${params.severity} severity, please respond within ${responseWindow} with:\n` +
    `1. Acknowledgement of ownership\n` +
    `2. Containment status: ${signals.containment}\n` +
    `3. Permanent fix plan: ${signals.permanentFix}\n\n` +
    `Return evidence to QM for verification once actions are complete.\n\n` +
    `Thanks,\n${DEFAULT_QM_OWNER}\nQuality Management`;

  return {
    to,
    cc: ["qm@manex.internal"],
    subject,
    body,
  };
}

function buildEscalationEmail(params: {
  caseId: string;
  story: StoryKey;
  summary: string;
  severity: Severity;
  defectCode: string | null;
  productId: string;
  partNumber: string | null;
}) {
  const team = ownerTeamByStory[params.story];
  const manager = managerByStory[params.story];
  const signals = storySignals(params.story);
  const responseWindow = severityResponseWindow[params.severity];
  const subject = `[ESCALATION] ${params.caseId}: management review required — ${params.severity.toUpperCase()} severity`;
  const body =
    `Dear ${manager.name},\n\n` +
    `This is an escalation notice for ${params.caseId}, currently owned by ${team}.\n\n` +
    `--- Case details ---\n` +
    `Severity: ${params.severity.toUpperCase()}\n` +
    `Product: ${params.productId}\n` +
    `Part: ${params.partNumber ?? "N/A"}\n` +
    `Defect code: ${params.defectCode ?? "N/A"}\n` +
    `Expected response window: ${responseWindow}\n\n` +
    `--- Summary ---\n` +
    `${params.summary}\n\n` +
    `--- Root cause analysis ---\n` +
    `${signals.why.map((line) => `• ${line}`).join("\n")}\n\n` +
    `--- Reason for escalation ---\n` +
    `The ${team} team has not responded within the expected ${responseWindow} window, ` +
    `or the severity of this case requires management visibility and intervention.\n\n` +
    `--- Requested actions ---\n` +
    `1. Review case priority and resource allocation\n` +
    `2. Ensure containment: ${signals.containment}\n` +
    `3. Approve permanent fix plan: ${signals.permanentFix}\n\n` +
    `Please advise on next steps or delegate accordingly.\n\n` +
    `Thanks,\n${DEFAULT_QM_OWNER}\nQuality Management`;

  return {
    to: [manager.email],
    cc: [teamEmailByStory[params.story], "qm@manex.internal"],
    subject,
    body,
  };
}

function historyToTimeline(history: StateHistoryEntry[] | null): TimelineEvent[] {
  if (!history?.length) return [];
  return history
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      title: `State set to ${entry.state.replaceAll("_", " ")}`,
      description: entry.note,
      source:
        entry.actor === "system"
          ? "system"
          : entry.actor === "team"
            ? "team"
            : entry.actor === "cs"
              ? "cs"
              : "qm",
    }));
}

function buildInFilter(values: string[]) {
  return `in.(${values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`;
}

function formatExternalTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function inferOwnerConfirmation(params: {
  clarity: Clarity;
  state: CaseState;
}): ProposedFix["ownerConfirmation"] {
  if (params.clarity === "needs clarification") return "revised";
  if (
    params.state === "returned_to_qm_for_verification" ||
    params.state === "closed"
  ) {
    return "accepted";
  }
  return "pending";
}

function buildProposedFix(params: {
  signals: ReturnType<typeof storySignals>;
  evidenceTrail: string[];
  severity: Severity;
  clarity: Clarity;
  state: CaseState;
}): ProposedFix {
  const confidence =
    params.clarity === "needs clarification"
      ? "low"
      : params.severity === "high"
        ? "high"
        : params.severity === "medium"
          ? "medium"
          : "low";

  return {
    containment: params.signals.containment,
    permanentFix: params.signals.permanentFix,
    validation: params.signals.validation,
    confidence,
    basis: [...params.signals.why, ...params.evidenceTrail].slice(0, 4),
    ownerConfirmation: inferOwnerConfirmation({
      clarity: params.clarity,
      state: params.state,
    }),
  };
}

function defaultTimeSignal(story: StoryKey) {
  if (story === "supplier") return "Watch weeks 5-6/2026 and March field claims.";
  if (story === "process") return "Check the Dec 2025 spike at Montage Linie 1.";
  if (story === "design") return "Look for 8-12 week lag after build.";
  return "Check repeat orders and operator linkage.";
}

function buildFallbackVisualization(params: {
  story: StoryKey;
  partNumber: string;
  summary: string;
}): StoryVisualization {
  if (params.story === "supplier") {
    return {
      kind: "supplier",
      title: "Supplier blast radius",
      summary: params.summary,
      steps: [
        { label: "Supplier batch", value: "Batch under review", highlight: true },
        { label: "Affected products", value: "Loading" },
        { label: "Defects", value: "Loading" },
        { label: "Field claims", value: "Loading" },
      ],
      annotations: [
        "Track incoming material exposure before release.",
        `Part focus: ${params.partNumber}.`,
      ],
    };
  }
  if (params.story === "design") {
    return {
      kind: "design",
      title: "BOM hotspot",
      summary: params.summary,
      assembly: "Assembly under review",
      findNumber: params.partNumber === "PM-00015" ? "R33" : "Target node",
      lagDistribution: [
        { label: "0-4 wk", count: 0 },
        { label: "4-8 wk", count: 0 },
        { label: "8-12 wk", count: 0, highlight: true },
        { label: "12+ wk", count: 0 },
      ],
      annotations: [
        "Field-only failures point to latent design weakness.",
      ],
    };
  }
  if (params.story === "handling") {
    return {
      kind: "handling",
      title: "Handling correlation",
      summary: params.summary,
      operator: "Operator under review",
      steps: [
        { label: "Recurring orders", value: "Loading", highlight: true },
        { label: "Dominant operator", value: "Loading" },
        { label: "Cosmetic defects", value: "Loading" },
      ],
      annotations: [
        "Join through rework to avoid missing the operator signature.",
      ],
    };
  }
  return {
    kind: "process",
    title: "Process drift trend",
    summary: params.summary,
    section: "Montage Linie 1",
    trend: [],
    annotations: [
      "A short, self-correcting spike is a classic calibration signature.",
    ],
  };
}

function buildFallbackTriageContext(params: {
  story: StoryKey;
  severity: Severity;
  nextMove: string;
}): TriageContext {
  return {
    matchingCases: 1,
    openMatchingCases: 1,
    queuePriority:
      params.severity === "high"
        ? "P1 attention"
        : params.severity === "medium"
          ? "P2 route this shift"
          : "Monitor but keep moving",
    timeSignal: defaultTimeSignal(params.story),
    nextMove: params.nextMove,
  };
}

function weekBucketLabel(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()}`;
}

function bucketLag(days: number | null) {
  if (days == null) return "Unknown";
  if (days < 28) return "0-4 wk";
  if (days < 56) return "4-8 wk";
  if (days < 84) return "8-12 wk";
  return "12+ wk";
}

function formatQueuePriority(caseItem: QontrolCase, openMatchingCases: number) {
  if (caseItem.severity === "high") {
    return `P1 attention across ${openMatchingCases} active ${caseItem.story} case(s)`;
  }
  if (caseItem.story === "handling") {
    return `Low severity, but repeated handling pattern across ${openMatchingCases} active case(s)`;
  }
  return `Route with ${openMatchingCases} active ${caseItem.story} case(s) in view`;
}

function buildSimilarTickets(
  current: QontrolCase,
  related: QontrolCase[],
): QontrolCase["similarTickets"] {
  return related.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    story: item.story,
    team: item.ownerTeam,
    actionTaken: item.proposedFix.permanentFix,
    timeToFix:
      item.state === "closed"
        ? "Closed"
        : item.state === "returned_to_qm_for_verification"
          ? "Awaiting QM verification"
          : "Active",
    outcome:
      item.state === "closed"
        ? "worked"
        : item.clarity === "needs clarification"
          ? "reopened"
          : "partial",
    learning: item.routingWhy[0] ?? current.routingWhy[0] ?? "Pattern match under review.",
  }));
}

function buildBaseCaseFromDefect(row: DefectRow): QontrolCase {
  const story = classifyStory({
    sourceType: "defect",
    defectCode: row.defect_code,
    articleId: row.article_id,
    partNumber: row.reported_part_number,
  });
  const signals = storySignals(story);
  const summary =
    row.notes?.trim() ||
    `${row.defect_code ?? "Defect"} detected on ${row.product_id}.`;
  const now = row.defect_ts ?? new Date().toISOString();

  return {
    id: row.defect_id,
    title: `${row.defect_code ?? "Defect"} on ${row.product_id}`,
    sourceType: "defect",
    state: "unassigned",
    story,
    clarity: story === "handling" && toSeverity(row.severity) === "low" ? "warning" : "match",
    severity: toSeverity(row.severity),
    costUsd: Number(row.cost ?? 0),
    market: "N/A",
    productId: row.product_id,
    articleId: row.article_id,
    partNumber: row.reported_part_number ?? "Unknown",
    imageUrl: row.image_url,
    ownerTeam: ownerTeamByStory[story],
    assignee: "Unassigned",
    qmOwner: DEFAULT_QM_OWNER,
    lastUpdateAt: now,
    nextFollowUpAt: new Date(Date.parse(now) + 1000 * 60 * 60 * 24 * 2).toISOString(),
    summary,
    routingWhy: signals.why,
    missingEvidence: ["Technical owner confirmation pending."],
    evidenceTrail: [
      `Defect code: ${row.defect_code ?? "unknown"}`,
      `Article: ${row.article_id}`,
      `Part: ${row.reported_part_number ?? "not reported"}`,
      `Detected section: ${row.detected_section_name ?? "unknown"}`,
      `Occurrence section: ${row.occurrence_section_name ?? "unknown"}`,
    ],
    triageContext: buildFallbackTriageContext({
      story,
      severity: toSeverity(row.severity),
      nextMove: signals.containment,
    }),
    visualization: buildFallbackVisualization({
      story,
      partNumber: row.reported_part_number ?? "Unknown",
      summary,
    }),
    proposedFix: buildProposedFix({
      signals,
      evidenceTrail: [
        `Defect code: ${row.defect_code ?? "unknown"}`,
        `Article: ${row.article_id}`,
        `Part: ${row.reported_part_number ?? "not reported"}`,
      ],
      severity: toSeverity(row.severity),
      clarity: story === "handling" && toSeverity(row.severity) === "low" ? "warning" : "match",
      state: "unassigned",
    }),
    requestedAction: {
      containment: signals.containment,
      permanentFix: signals.permanentFix,
      validation: signals.validation,
    },
    similarTickets: [],
    learnings: [],
    timeline: [],
    emailDraft: buildEmailDraft({
      caseId: row.defect_id,
      story,
      summary,
      severity: toSeverity(row.severity),
      defectCode: row.defect_code,
      productId: row.product_id,
      partNumber: row.reported_part_number,
    }),
    escalationEmailDraft: buildEscalationEmail({
      caseId: row.defect_id,
      story,
      summary,
      severity: toSeverity(row.severity),
      defectCode: row.defect_code,
      productId: row.product_id,
      partNumber: row.reported_part_number,
    }),
  };
}

function buildBaseCaseFromClaim(row: ClaimRow): QontrolCase {
  const story = classifyStory({
    sourceType: "claim",
    defectCode: row.mapped_defect_code,
    articleId: row.article_id,
    partNumber: row.reported_part_number,
  });
  const signals = storySignals(story);
  const summary =
    row.complaint_text?.trim() ||
    `${row.field_claim_id} reported for ${row.product_id}.`;
  const now = row.claim_ts ?? new Date().toISOString();

  return {
    id: row.field_claim_id,
    title: `Field claim on ${row.product_id}`,
    sourceType: "claim",
    state: "unassigned",
    story,
    clarity: "match",
    severity: toSeverity(row.mapped_defect_severity),
    costUsd: Number(row.cost ?? 0),
    market: row.market ?? "N/A",
    productId: row.product_id,
    articleId: row.article_id,
    partNumber: row.reported_part_number ?? "Unknown",
    imageUrl: null,
    ownerTeam: ownerTeamByStory[story],
    assignee: "Unassigned",
    qmOwner: DEFAULT_QM_OWNER,
    csOwner: DEFAULT_CS_OWNER,
    lastUpdateAt: now,
    nextFollowUpAt: new Date(Date.parse(now) + 1000 * 60 * 60 * 24 * 2).toISOString(),
    summary,
    routingWhy: signals.why,
    missingEvidence: ["Case owner acknowledgement pending."],
    evidenceTrail: [
      `Claim market: ${row.market ?? "unknown"}`,
      `Mapped defect: ${row.mapped_defect_code ?? "none"}`,
      `Part: ${row.reported_part_number ?? "not reported"}`,
      `Build-to-claim lag: ${row.days_from_build != null ? `${row.days_from_build} days` : "unknown"}`,
    ],
    triageContext: buildFallbackTriageContext({
      story,
      severity: toSeverity(row.mapped_defect_severity),
      nextMove: signals.containment,
    }),
    visualization: buildFallbackVisualization({
      story,
      partNumber: row.reported_part_number ?? "Unknown",
      summary,
    }),
    proposedFix: buildProposedFix({
      signals,
      evidenceTrail: [
        `Claim market: ${row.market ?? "unknown"}`,
        `Mapped defect: ${row.mapped_defect_code ?? "none"}`,
        `Part: ${row.reported_part_number ?? "not reported"}`,
      ],
      severity: toSeverity(row.mapped_defect_severity),
      clarity: "match",
      state: "unassigned",
    }),
    requestedAction: {
      containment: signals.containment,
      permanentFix: signals.permanentFix,
      validation: signals.validation,
    },
    similarTickets: [],
    learnings: [],
    timeline: [],
    emailDraft: buildEmailDraft({
      caseId: row.field_claim_id,
      story,
      summary,
      severity: toSeverity(row.mapped_defect_severity),
      defectCode: row.mapped_defect_code,
      productId: row.product_id,
      partNumber: row.reported_part_number,
    }),
    escalationEmailDraft: buildEscalationEmail({
      caseId: row.field_claim_id,
      story,
      summary,
      severity: toSeverity(row.mapped_defect_severity),
      defectCode: row.mapped_defect_code,
      productId: row.product_id,
      partNumber: row.reported_part_number,
    }),
  };
}

function applyState(base: QontrolCase, state: CaseStateRow | undefined): QontrolCase {
  if (!state) return base;
  const nextState = state.current_state;
  const nextClarity = base.clarity;
  const severityOverride = extractSeverityOverride(state.state_history);
  return {
    ...base,
    state: nextState,
    assignee: state.assignee ?? base.assignee,
    ownerTeam: state.owner_team ?? base.ownerTeam,
    qmOwner: state.qm_owner ?? base.qmOwner,
    severity: severityOverride ?? base.severity,
    external: state.external_ticket ?? base.external,
    lastUpdateAt: state.updated_at ?? base.lastUpdateAt,
    timeline: historyToTimeline(state.state_history),
    proposedFix: {
      ...base.proposedFix,
      ownerConfirmation: inferOwnerConfirmation({
        clarity: nextClarity,
        state: nextState,
      }),
    },
  };
}

function extractSeverityOverride(
  history: StateHistoryEntry[] | null,
): Severity | undefined {
  if (!history?.length) return undefined;
  const byNewest = history
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  for (const entry of byNewest) {
    const match = entry.note.match(/severity updated to (low|medium|high)/i);
    if (match) {
      const value = match[1].toLowerCase();
      if (value === "low" || value === "medium" || value === "high") {
        return value;
      }
    }
  }
  return undefined;
}

async function fetchProducts(productIds: string[]): Promise<ProductRow[]> {
  if (productIds.length === 0) return [];
  return postgrestRequest<ProductRow[]>("product", {
    method: "GET",
    query: {
      select: "product_id,order_id,bom_id,build_ts",
      product_id: buildInFilter(productIds),
    },
  });
}

async function fetchReworkSummary(productIds: string[]): Promise<ReworkSummaryRow[]> {
  if (productIds.length === 0) return [];
  return postgrestRequest<ReworkSummaryRow[]>("rework", {
    method: "GET",
    query: {
      select: "product_id,user_id,action_text",
      product_id: buildInFilter(productIds),
      order: "ts.desc",
    },
  });
}

async function fetchSupplierBatches(partNumbers: string[]): Promise<SupplierBatchRow[]> {
  if (partNumbers.length === 0) return [];
  return postgrestRequest<SupplierBatchRow[]>("supplier_batch", {
    method: "GET",
    query: {
      select: "batch_id,part_number,supplier_name,received_date",
      part_number: buildInFilter(partNumbers),
      order: "received_date.desc",
    },
  });
}

async function fetchBomNodes(bomIds: string[]): Promise<BomNodeRow[]> {
  if (bomIds.length === 0) return [];
  return postgrestRequest<BomNodeRow[]>("bom_node", {
    method: "GET",
    query: {
      select: "bom_id,bom_node_id,parent_bom_node_id,part_number,node_type,find_number",
      bom_id: buildInFilter(bomIds),
    },
  });
}

function buildTriageContext(params: {
  item: QontrolCase;
  allCases: QontrolCase[];
  relatedDefects: DefectRow[];
  relatedClaims: ClaimRow[];
  dominantOperator?: string;
  recurringOrders?: string[];
}): TriageContext {
  const matchingCases = params.allCases.filter(
    (entry) => entry.story === params.item.story,
  );
  const openMatchingCases = matchingCases.filter((entry) => entry.state !== "closed");

  let timeSignal = defaultTimeSignal(params.item.story);
  if (params.item.story === "supplier") {
    timeSignal = `${params.relatedDefects.length} related defects and ${params.relatedClaims.length} field claims linked to ${params.item.partNumber}.`;
  } else if (params.item.story === "process") {
    timeSignal = `Spike concentrated around ${params.relatedDefects[0]?.occurrence_section_name ?? "Montage Linie 1"}.`;
  } else if (params.item.story === "design") {
    const lagCluster = params.relatedClaims.filter(
      (claim) => claim.days_from_build != null && claim.days_from_build >= 56 && claim.days_from_build < 84,
    ).length;
    timeSignal = `${lagCluster} claim(s) land in the 8-12 week latent-failure window.`;
  } else if (params.item.story === "handling") {
    timeSignal = `${params.dominantOperator ?? "Dominant operator"} appears across ${(params.recurringOrders ?? []).length} recurring order(s).`;
  }

  return {
    matchingCases: matchingCases.length,
    openMatchingCases: openMatchingCases.length,
    queuePriority: formatQueuePriority(params.item, openMatchingCases.length),
    timeSignal,
    nextMove: params.item.proposedFix.containment,
  };
}

function buildSupplierVisualization(params: {
  item: QontrolCase;
  relatedDefects: DefectRow[];
  relatedClaims: ClaimRow[];
  supplierBatch: SupplierBatchRow | undefined;
}): StoryVisualization {
  const affectedProducts = new Set([
    ...params.relatedDefects.map((entry) => entry.product_id),
    ...params.relatedClaims.map((entry) => entry.product_id),
  ]);

  return {
    kind: "supplier",
    title: "Supplier blast radius",
    summary:
      params.supplierBatch?.supplier_name != null
        ? `${params.supplierBatch.supplier_name} is the latest tracked supplier for ${params.item.partNumber}.`
        : `Track the incoming batch signature around ${params.item.partNumber}.`,
    steps: [
      {
        label: "Supplier batch",
        value: params.supplierBatch?.batch_id ?? "Batch under review",
        detail: params.supplierBatch?.received_date ?? "Latest receipt unknown",
        highlight: true,
      },
      {
        label: "Affected products",
        value: String(affectedProducts.size),
      },
      {
        label: "In-factory defects",
        value: String(params.relatedDefects.length),
      },
      {
        label: "Field claims",
        value: String(params.relatedClaims.length),
      },
    ],
    annotations: [
      "Batch-to-defect traceability is more useful than raw line-level counts here.",
      "Use this view to decide containment scope before pushing supplier action.",
    ],
  };
}

function buildProcessVisualization(params: {
  item: QontrolCase;
  relatedDefects: DefectRow[];
}): StoryVisualization {
  const trendCounts = new Map<string, { label: string; count: number }>();
  for (const row of params.relatedDefects) {
    const key = row.defect_ts?.slice(0, 10) ?? "unknown";
    const current = trendCounts.get(key);
    trendCounts.set(key, {
      label: weekBucketLabel(row.defect_ts),
      count: (current?.count ?? 0) + 1,
    });
  }
  const trend = Array.from(trendCounts.entries())
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);
  const maxCount = trend.reduce((highest, point) => Math.max(highest, point.count), 0);
  const currentBucket = params.item.lastUpdateAt.slice(0, 10);

  return {
    kind: "process",
    title: "Process drift trend",
    summary: "Look for the short-lived spike and the section where it concentrates.",
    section:
      params.relatedDefects[0]?.occurrence_section_name ??
      params.relatedDefects[0]?.detected_section_name ??
      "Montage Linie 1",
    trend: trend.map((point) => ({
      label: point.label,
      count: point.count,
      highlight: point.count === maxCount || point.key === currentBucket,
    })),
    annotations: [
      "Contained, time-boxed spikes are usually stronger evidence than absolute volume.",
      "Treat end-of-line detection hotspots as signal amplifiers, not root cause on their own.",
    ],
  };
}

function buildDesignVisualization(params: {
  item: QontrolCase;
  relatedClaims: ClaimRow[];
  bomNodes: BomNodeRow[];
}): StoryVisualization {
  const lagBuckets = new Map<string, number>([
    ["0-4 wk", 0],
    ["4-8 wk", 0],
    ["8-12 wk", 0],
    ["12+ wk", 0],
  ]);
  for (const claim of params.relatedClaims) {
    const bucket = bucketLag(claim.days_from_build);
    if (lagBuckets.has(bucket)) {
      lagBuckets.set(bucket, (lagBuckets.get(bucket) ?? 0) + 1);
    }
  }

  const matchedNode = params.bomNodes.find(
    (node) => node.part_number === params.item.partNumber,
  );

  return {
    kind: "design",
    title: "BOM hotspot",
    summary: "Field-only failures with zero factory defects usually point to a design leak.",
    assembly: params.item.partNumber === "PM-00015" ? "Steuerplatine" : "Assembly node",
    findNumber: matchedNode?.find_number ?? (params.item.partNumber === "PM-00015" ? "R33" : "Target node"),
    lagDistribution: Array.from(lagBuckets.entries()).map(([label, count]) => ({
      label,
      count,
      highlight: label === "8-12 wk",
    })),
    annotations: [
      "Use BOM position plus lag window together to explain why factory tests missed the defect.",
      "This is the story where field-claim evidence matters more than defect volume.",
    ],
  };
}

function buildHandlingVisualization(params: {
  relatedDefects: DefectRow[];
  recurringOrders: string[];
  dominantOperator: string;
}): StoryVisualization {
  const defectTypes = new Set(
    params.relatedDefects.map((entry) => entry.defect_code).filter(Boolean),
  );

  return {
    kind: "handling",
    title: "Handling correlation",
    summary: "The operator pattern only becomes visible after joining rework back to the recurring orders.",
    operator: params.dominantOperator,
    steps: [
      {
        label: "Recurring orders",
        value: params.recurringOrders.length > 0 ? params.recurringOrders.join(", ") : "Order cluster pending",
        highlight: true,
      },
      {
        label: "Dominant operator",
        value: params.dominantOperator,
      },
      {
        label: "Cosmetic defect types",
        value: String(defectTypes.size || 0),
        detail: Array.from(defectTypes).filter(Boolean).join(", "),
      },
    ],
    annotations: [
      "Low severity does not mean low learning value when the same operator/order cluster repeats.",
      "Use recurrence drop after retraining as the key validation signal.",
    ],
  };
}

function decorateCase(params: {
  item: QontrolCase;
  allCases: QontrolCase[];
  defects: DefectRow[];
  claims: ClaimRow[];
  productById: Map<string, ProductRow>;
  reworkByProduct: Map<string, ReworkSummaryRow[]>;
  supplierByPart: Map<string, SupplierBatchRow[]>;
  bomNodesByBom: Map<string, BomNodeRow[]>;
}): QontrolCase {
  const sameStoryCases = params.allCases
    .filter((entry) => entry.story === params.item.story && entry.id !== params.item.id)
    .sort(
      (a, b) =>
        new Date(b.lastUpdateAt).getTime() - new Date(a.lastUpdateAt).getTime(),
    );

  const relatedDefects = params.defects.filter((entry) => {
    if (params.item.story === "supplier") {
      return entry.reported_part_number === params.item.partNumber;
    }
    if (params.item.story === "process") {
      return entry.defect_code === "VIB_FAIL";
    }
    if (params.item.story === "handling") {
      return entry.defect_code === "VISUAL_SCRATCH" || entry.defect_code === "LABEL_MISALIGN";
    }
    return entry.reported_part_number === params.item.partNumber;
  });

  const relatedClaims = params.claims.filter((entry) => {
    if (params.item.story === "supplier") {
      return entry.reported_part_number === params.item.partNumber;
    }
    if (params.item.story === "design") {
      return entry.article_id === params.item.articleId;
    }
    return entry.reported_part_number === params.item.partNumber;
  });

  const product = params.productById.get(params.item.productId);
  const reworks = params.reworkByProduct.get(params.item.productId) ?? [];
  const storyReworks = params.item.story === "handling"
    ? Array.from(params.reworkByProduct.entries())
        .filter(([productId]) =>
          sameStoryCases.some((entry) => entry.productId === productId) ||
          productId === params.item.productId,
        )
        .flatMap(([, rows]) => rows)
    : reworks;
  const operatorCounts = new Map<string, number>();
  for (const row of storyReworks) {
    if (!row.user_id) continue;
    operatorCounts.set(row.user_id, (operatorCounts.get(row.user_id) ?? 0) + 1);
  }
  const dominantOperator =
    Array.from(operatorCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    (params.item.story === "handling" ? "user_042" : params.item.assignee);

  const recurringOrders = Array.from(
    new Set(
      [params.item, ...sameStoryCases]
        .map((entry) => params.productById.get(entry.productId)?.order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 3);

  const triageContext = buildTriageContext({
    item: params.item,
    allCases: params.allCases,
    relatedDefects,
    relatedClaims,
    dominantOperator,
    recurringOrders,
  });

  let visualization: StoryVisualization;
  if (params.item.story === "supplier") {
    visualization = buildSupplierVisualization({
      item: params.item,
      relatedDefects,
      relatedClaims,
      supplierBatch: params.supplierByPart.get(params.item.partNumber)?.[0],
    });
  } else if (params.item.story === "design") {
    visualization = buildDesignVisualization({
      item: params.item,
      relatedClaims,
      bomNodes: params.bomNodesByBom.get(product?.bom_id ?? "") ?? [],
    });
  } else if (params.item.story === "handling") {
    visualization = buildHandlingVisualization({
      relatedDefects,
      recurringOrders,
      dominantOperator,
    });
  } else {
    visualization = buildProcessVisualization({
      item: params.item,
      relatedDefects,
    });
  }

  return {
    ...params.item,
    triageContext,
    visualization,
    proposedFix: {
      ...params.item.proposedFix,
      ownerConfirmation: inferOwnerConfirmation({
        clarity: params.item.clarity,
        state: params.item.state,
      }),
    },
    similarTickets: buildSimilarTickets(params.item, sameStoryCases),
  };
}

async function fetchOptionalStates(): Promise<CaseStateRow[]> {
  try {
    return await postgrestRequest<CaseStateRow[]>("qontrol_case_state", {
      method: "GET",
      query: { select: "*" },
    });
  } catch {
    return [];
  }
}

export async function listCases(): Promise<QontrolCase[]> {
  const [defects, claims, states] = await Promise.all([
    postgrestRequest<DefectRow[]>("v_defect_detail", {
      method: "GET",
      query: {
        select:
          "defect_id,product_id,defect_ts,source_type,defect_code,severity,detected_section_name,occurrence_section_name,reported_part_number,image_url,cost,notes,article_id,article_name",
        order: "defect_ts.desc",
        limit: "120",
      },
    }),
    postgrestRequest<ClaimRow[]>("v_field_claim_detail", {
      method: "GET",
      query: {
        select:
          "field_claim_id,product_id,claim_ts,market,complaint_text,reported_part_number,cost,mapped_defect_id,mapped_defect_code,mapped_defect_severity,notes,article_id,article_name,days_from_build",
        order: "claim_ts.desc",
        limit: "120",
      },
    }),
    fetchOptionalStates(),
  ]);

  const productIds = Array.from(
    new Set([...defects.map((row) => row.product_id), ...claims.map((row) => row.product_id)]),
  );
  const [products, reworks, supplierBatches] = await Promise.all([
    fetchProducts(productIds),
    fetchReworkSummary(productIds),
    fetchSupplierBatches(
      Array.from(
        new Set(
          [...defects.map((row) => row.reported_part_number), ...claims.map((row) => row.reported_part_number)].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ),
    ),
  ]);

  const bomIds = Array.from(
    new Set(products.map((row) => row.bom_id).filter((value): value is string => Boolean(value))),
  );
  const bomNodes = await fetchBomNodes(bomIds);

  const stateByCaseId = new Map(states.map((item) => [item.case_id, item]));
  const productById = new Map(products.map((item) => [item.product_id, item]));
  const reworkByProduct = new Map<string, ReworkSummaryRow[]>();
  for (const row of reworks) {
    const current = reworkByProduct.get(row.product_id) ?? [];
    current.push(row);
    reworkByProduct.set(row.product_id, current);
  }
  const supplierByPart = new Map<string, SupplierBatchRow[]>();
  for (const row of supplierBatches) {
    const current = supplierByPart.get(row.part_number) ?? [];
    current.push(row);
    supplierByPart.set(row.part_number, current);
  }
  const bomNodesByBom = new Map<string, BomNodeRow[]>();
  for (const row of bomNodes) {
    const current = bomNodesByBom.get(row.bom_id) ?? [];
    current.push(row);
    bomNodesByBom.set(row.bom_id, current);
  }

  const merged = [
    ...defects.map((row) => applyState(buildBaseCaseFromDefect(row), stateByCaseId.get(row.defect_id))),
    ...claims.map((row) =>
      applyState(buildBaseCaseFromClaim(row), stateByCaseId.get(row.field_claim_id)),
    ),
  ];

  return merged
    .map((item) =>
      decorateCase({
        item,
        allCases: merged,
        defects,
        claims,
        productById,
        reworkByProduct,
        supplierByPart,
        bomNodesByBom,
      }),
    )
    .sort(
      (a, b) => new Date(b.lastUpdateAt).getTime() - new Date(a.lastUpdateAt).getTime(),
    );
}

function normalizeCaseRef(caseId: string) {
  if (caseId.startsWith("DEF-")) {
    return { sourceType: "defect" as const, sourceRowId: caseId };
  }
  if (caseId.startsWith("FC-")) {
    return { sourceType: "claim" as const, sourceRowId: caseId };
  }
  throw new Error(`Unsupported case id: ${caseId}`);
}

async function getStateForCase(caseId: string): Promise<CaseStateRow | null> {
  const rows = await postgrestRequest<CaseStateRow[]>("qontrol_case_state", {
    method: "GET",
    query: {
      select: "*",
      case_id: `eq.${caseId}`,
      limit: "1",
    },
  });
  return rows[0] ?? null;
}

async function upsertCaseState(params: {
  caseId: string;
  productId: string;
  defectId: string | null;
  state: CaseState;
  assignee: string | null;
  ownerTeam: string | null;
  qmOwner: string | null;
  note: string;
  actor?: string;
  externalTicket?: TeamTicket | null;
}) {
  const current = await getStateForCase(params.caseId);
  const source = normalizeCaseRef(params.caseId);
  const entry: StateHistoryEntry = {
    id: crypto.randomUUID(),
    state: params.state,
    at: new Date().toISOString(),
    actor: params.actor ?? DEFAULT_USER,
    note: params.note,
  };
  const history = [...(current?.state_history ?? []), entry];
  const payload = {
    case_id: params.caseId,
    source_type: source.sourceType,
    source_row_id: source.sourceRowId,
    product_id: params.productId,
    defect_id: params.defectId,
    current_state: params.state,
    assignee: params.assignee,
    owner_team: params.ownerTeam,
    qm_owner: params.qmOwner,
    state_history: history,
    external_ticket:
      params.externalTicket === undefined
        ? current?.external_ticket ?? null
        : params.externalTicket,
    updated_at: new Date().toISOString(),
  };
  const rows = await postgrestRequest<CaseStateRow[]>("qontrol_case_state", {
    method: "POST",
    query: {
      on_conflict: "case_id",
    },
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return rows[0];
}

async function getCaseById(caseId: string): Promise<QontrolCase> {
  const cases = await listCases();
  const item = cases.find((entry) => entry.id === caseId);
  if (!item) {
    throw new Error(`Case not found: ${caseId}`);
  }
  return item;
}

async function insertProductAction(payload: Omit<ProductActionRow, "action_id">) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actionId = `PA-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    try {
      const created = await postgrestRequest<ProductActionRow[]>("product_action", {
        method: "POST",
        body: { action_id: actionId, ...payload },
        prefer: "return=representation",
      });
      return created[0];
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("duplicate key value violates unique constraint")
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unable to allocate unique product_action id after retries.");
}

async function insertRework(payload: {
  defect_id: string;
  product_id: string;
  action_text: string;
  reported_part_number: string;
  user_id: string;
  cost: number;
  time_minutes: number;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reworkId = `RW-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    try {
      await postgrestRequest("rework", {
        method: "POST",
        body: {
          rework_id: reworkId,
          defect_id: payload.defect_id,
          product_id: payload.product_id,
          ts: new Date().toISOString(),
          action_text: payload.action_text,
          reported_part_number: payload.reported_part_number,
          user_id: payload.user_id,
          cost: payload.cost,
          time_minutes: payload.time_minutes,
        },
        prefer: "return=representation",
      });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("duplicate key value violates unique constraint")
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unable to allocate unique rework id after retries.");
}

export async function assignCase(caseId: string) {
  const current = await getCaseById(caseId);
  const assignee = ownerAssigneeByStory[current.story];
  const ownerTeam = ownerTeamByStory[current.story];

  await insertProductAction({
    product_id: current.productId,
    ts: new Date().toISOString(),
    action_type: "assignment",
    status: "assigned",
    user_id: DEFAULT_USER,
    section_id: null,
    comments: `Qontrol assigned ${caseId} to ${ownerTeam}.`,
    defect_id: caseId.startsWith("DEF-") ? caseId : null,
  });

  await upsertCaseState({
    caseId,
    productId: current.productId,
    defectId: caseId.startsWith("DEF-") ? caseId : null,
    state: "assigned",
    assignee,
    ownerTeam,
    qmOwner: current.qmOwner,
    note: `Assigned to ${ownerTeam}.`,
    actor: "qm",
    externalTicket: current.external ?? null,
  });

  return getCaseById(caseId);
}

export async function closeCase(caseId: string) {
  const current = await getCaseById(caseId);
  const defectId =
    caseId.startsWith("DEF-") ? caseId : current.evidenceTrail.find((entry) => entry.startsWith("Mapped defect: "))?.split(": ")[1] ?? null;

  await insertProductAction({
    product_id: current.productId,
    ts: new Date().toISOString(),
    action_type: "closure",
    status: "closed",
    user_id: DEFAULT_USER,
    section_id: null,
    comments: `Qontrol closed ${caseId}.`,
    defect_id: defectId && defectId.startsWith("DEF-") ? defectId : null,
  });

  if (defectId && defectId.startsWith("DEF-")) {
    await insertRework({
      defect_id: defectId,
      product_id: current.productId,
      action_text: `Closed via Qontrol workflow for ${caseId}.`,
      reported_part_number: current.partNumber,
      user_id: DEFAULT_USER,
      cost: 0,
      time_minutes: 30,
    });
  }

  await upsertCaseState({
    caseId,
    productId: current.productId,
    defectId: defectId && defectId.startsWith("DEF-") ? defectId : null,
    state: "closed",
    assignee: current.assignee,
    ownerTeam: current.ownerTeam,
    qmOwner: current.qmOwner,
    note: "Case closed and write-back captured.",
    actor: "qm",
    externalTicket: current.external ?? null,
  });

  return getCaseById(caseId);
}

export async function updateCaseSeverity(caseId: string, severity: Severity) {
  const current = await getCaseById(caseId);
  await upsertCaseState({
    caseId,
    productId: current.productId,
    defectId: caseId.startsWith("DEF-") ? caseId : null,
    state: current.state,
    assignee: current.assignee,
    ownerTeam: current.ownerTeam,
    qmOwner: current.qmOwner,
    note: `Severity updated to ${severity}.`,
    actor: "qm",
    externalTicket: current.external ?? null,
  });
  return getCaseById(caseId);
}

function buildCaseUrl(caseId: string) {
  const base = process.env.QONTROL_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/?case=${encodeURIComponent(caseId)}` : null;
}

function buildGitHubIssueBody(caseItem: QontrolCase) {
  const caseUrl = buildCaseUrl(caseItem.id);
  const lines = [
    `## Qontrol Case`,
    "",
    `- Case ID: ${caseItem.id}`,
    `- Severity: ${caseItem.severity.toUpperCase()}`,
    `- Source: ${caseItem.sourceType}`,
    `- Story: ${caseItem.story}`,
    `- Product: ${caseItem.productId}`,
    `- Article / Part: ${caseItem.articleId} / ${caseItem.partNumber}`,
    "",
    `## Summary`,
    "",
    caseItem.summary,
    "",
    `## Evidence`,
    "",
    ...caseItem.evidenceTrail.map((entry) => `- ${entry}`),
    "",
    `## Proposed Fix`,
    "",
    `### Containment`,
    caseItem.proposedFix.containment,
    "",
    `### Permanent Fix`,
    caseItem.proposedFix.permanentFix,
    "",
    `### Validation Ask`,
    caseItem.proposedFix.validation,
    "",
    `### Confidence`,
    `- ${caseItem.proposedFix.confidence}`,
    ...caseItem.proposedFix.basis.map((entry) => `- ${entry}`),
  ];

  if (caseUrl) {
    lines.push("", `## Qontrol Link`, "", caseUrl);
  }

  return lines.join("\n");
}

function shouldAddCaseToGitHubBoard(caseItem: QontrolCase) {
  return caseItem.ownerTeam === "R&D";
}

function buildExternalTicket(params: {
  caseItem: QontrolCase;
  issue: Awaited<ReturnType<typeof getGitHubIssue>>;
  projectItemId?: number;
  status?: string;
  sync?: TeamTicket["sync"];
  syncNote?: string;
}) {
  const config = getGitHubConfig();
  const projectItemId = params.projectItemId ?? params.caseItem.external?.projectItemId;
  return {
    system: "GitHub" as const,
    ticketId: `#${params.issue.number}`,
    urlLabel: "Open GitHub issue",
    url: params.issue.html_url,
    status: params.status ?? (params.issue.state === "closed" ? "Ready for QM verification" : "Open"),
    assignee: params.issue.assignees[0]?.login ?? params.caseItem.assignee,
    lastUpdate: formatExternalTimestamp(params.issue.updated_at),
    sync: params.sync ?? "synced",
    repo: config.repoSlug,
    issueNumber: params.issue.number,
    projectItemId,
    projectUrl: projectItemId ? getGitHubProjectUrl() : undefined,
    lastSyncNote: params.syncNote,
  };
}

function mapExternalStatusToCaseState(
  currentState: CaseState,
  status: string,
  issueState: "open" | "closed",
): CaseState {
  const normalized = status.toLowerCase();
  if (issueState === "closed" || normalized.includes("ready for qm")) {
    return currentState === "closed" ? "closed" : "returned_to_qm_for_verification";
  }
  if (normalized.includes("in progress") || normalized.includes("investigating")) {
    return "assigned";
  }
  return currentState;
}

async function findCaseIdByGitHubIssue(params: {
  issueNumber?: number;
  repo?: string;
  body?: string | null;
}) {
  const states = await fetchOptionalStates();
  const byExternal = states.find((entry) => {
    const external = entry.external_ticket;
    if (!external?.issueNumber) return false;
    if (params.issueNumber !== external.issueNumber) return false;
    if (!params.repo || !external.repo) return true;
    return params.repo.toLowerCase() === external.repo.toLowerCase();
  });
  if (byExternal) return byExternal.case_id;

  if (!params.body) return null;
  const match = params.body.match(/Case ID:\s*(DEF-[0-9]{5}|FC-[0-9]{5})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

async function findCaseIdByProjectItem(projectItemId: number) {
  const states = await fetchOptionalStates();
  return (
    states.find((entry) => entry.external_ticket?.projectItemId === projectItemId)?.case_id ??
    null
  );
}

async function persistExternalSync(params: {
  caseId: string;
  externalTicket: TeamTicket;
  note: string;
  actor?: string;
  nextState?: CaseState;
}) {
  const current = await getCaseById(params.caseId);
  await upsertCaseState({
    caseId: params.caseId,
    productId: current.productId,
    defectId: params.caseId.startsWith("DEF-") ? params.caseId : null,
    state: params.nextState ?? current.state,
    assignee:
      params.externalTicket.assignee && params.externalTicket.assignee !== "Unassigned"
        ? params.externalTicket.assignee
        : current.assignee,
    ownerTeam: current.ownerTeam,
    qmOwner: current.qmOwner,
    note: params.note,
    actor: params.actor ?? "system",
    externalTicket: params.externalTicket,
  });
  return getCaseById(params.caseId);
}

export async function connectCaseToGitHub(caseId: string) {
  const current = await getCaseById(caseId);
  const title = `[${current.severity.toUpperCase()}] ${current.id} - ${current.title}`;
  const body = buildGitHubIssueBody(current);

  const issue =
    current.external?.issueNumber != null
      ? await updateGitHubIssue(current.external.issueNumber, { title, body })
      : await createGitHubIssue({ title, body });

  const projectItem =
    shouldAddCaseToGitHubBoard(current)
      ? current.external?.projectItemId != null
        ? { id: current.external.projectItemId }
        : await addIssueToGitHubProject(issue.number)
      : null;

  const external = buildExternalTicket({
    caseItem: current,
    issue,
    projectItemId: projectItem?.id,
    status: issue.state === "closed" ? "Ready for QM verification" : "Open",
    syncNote: current.external?.issueNumber
      ? "GitHub issue refreshed from Qontrol."
      : "GitHub issue created from Qontrol.",
  });

  return persistExternalSync({
    caseId,
    externalTicket: external,
    note: current.external?.issueNumber
      ? `GitHub issue #${issue.number} updated from Qontrol.`
      : `GitHub issue #${issue.number} created for outbound handoff.`,
    actor: "system",
    nextState: current.state === "unassigned" ? "assigned" : current.state,
  });
}

export async function syncCaseFromGitHub(caseId: string) {
  const current = await getCaseById(caseId);
  if (!current.external?.issueNumber) {
    throw new Error("Case is not linked to a GitHub issue yet.");
  }

  const issue = await getGitHubIssue(current.external.issueNumber);
  const external = buildExternalTicket({
    caseItem: current,
    issue,
    status: current.external.status,
    syncNote: "Manual sync pulled latest GitHub state.",
  });

  return persistExternalSync({
    caseId,
    externalTicket: external,
    note: `GitHub issue #${issue.number} synced back into Qontrol.`,
    actor: "system",
    nextState: mapExternalStatusToCaseState(current.state, external.status, issue.state),
  });
}

export async function handleGitHubWebhook(
  eventName: string,
  payload: Record<string, unknown>,
) {
  if (eventName === "issues") {
    const issue = payload.issue as {
      number: number;
      html_url: string;
      state: "open" | "closed";
      updated_at: string;
      body?: string | null;
      assignees?: Array<{ login: string }>;
    } | undefined;
    const repository = payload.repository as { full_name?: string } | undefined;
    if (!issue?.number || !repository?.full_name) return null;

    const caseId = await findCaseIdByGitHubIssue({
      issueNumber: issue.number,
      repo: repository.full_name,
      body: issue.body ?? null,
    });
    if (!caseId) return null;

    const current = await getCaseById(caseId);
    const external: TeamTicket = {
      system: "GitHub",
      ticketId: `#${issue.number}`,
      urlLabel: "Open GitHub issue",
      url: issue.html_url,
      status:
        issue.state === "closed"
          ? "Ready for QM verification"
          : current.external?.status ?? "Open",
      assignee: issue.assignees?.[0]?.login ?? current.assignee,
      lastUpdate: formatExternalTimestamp(issue.updated_at),
      sync: "synced",
      repo: repository.full_name,
      issueNumber: issue.number,
      projectItemId: current.external?.projectItemId,
      projectUrl: current.external?.projectUrl,
      lastSyncNote: `GitHub issue ${String(payload.action ?? "updated")} webhook received.`,
    };

    return persistExternalSync({
      caseId,
      externalTicket: external,
      note: `GitHub issue ${String(payload.action ?? "updated")} on ${external.ticketId}.`,
      actor: "system",
      nextState: mapExternalStatusToCaseState(current.state, external.status, issue.state),
    });
  }

  if (eventName === "issue_comment") {
    const issue = payload.issue as {
      number: number;
      html_url: string;
      state: "open" | "closed";
      updated_at: string;
      body?: string | null;
    } | undefined;
    const comment = payload.comment as { body?: string; html_url?: string } | undefined;
    const repository = payload.repository as { full_name?: string } | undefined;
    if (!issue?.number || !repository?.full_name || !comment?.body) return null;

    const caseId = await findCaseIdByGitHubIssue({
      issueNumber: issue.number,
      repo: repository.full_name,
      body: issue.body ?? null,
    });
    if (!caseId) return null;

    const current = await getCaseById(caseId);
    const external: TeamTicket = {
      system: "GitHub",
      ticketId: `#${issue.number}`,
      urlLabel: "Open GitHub issue",
      url: issue.html_url,
      status: current.external?.status ?? "Open",
      assignee: current.external?.assignee ?? current.assignee,
      lastUpdate: formatExternalTimestamp(issue.updated_at),
      sync: "synced",
      repo: repository.full_name,
      issueNumber: issue.number,
      projectItemId: current.external?.projectItemId,
      projectUrl: current.external?.projectUrl,
      lastSyncNote: "GitHub comment synced into Qontrol timeline.",
    };

    return persistExternalSync({
      caseId,
      externalTicket: external,
      note: `GitHub comment received: ${comment.body.slice(0, 180)}`,
      actor: "team",
      nextState: current.state,
    });
  }

  if (eventName === "projects_v2_item") {
    const projectItem = payload.projects_v2_item as { id?: number } | undefined;
    const changes = payload.changes as {
      field_value?: {
        field_name?: string;
        from?: { name?: string; value?: string };
        to?: { name?: string; value?: string };
      };
    } | undefined;
    const projectItemId = projectItem?.id;
    const statusField = changes?.field_value;
    if (!projectItemId || statusField?.field_name !== "Status") return null;

    const caseId = await findCaseIdByProjectItem(projectItemId);
    if (!caseId) return null;

    const current = await getCaseById(caseId);
    const nextStatus =
      statusField.to?.name ??
      statusField.to?.value ??
      current.external?.status ??
      "In progress";

    const external: TeamTicket = {
      system: "GitHub",
      ticketId: current.external?.ticketId ?? "Linked issue",
      urlLabel: current.external?.urlLabel ?? "Open GitHub issue",
      url: current.external?.url,
      status: nextStatus,
      assignee: current.external?.assignee ?? current.assignee,
      lastUpdate: formatExternalTimestamp(new Date().toISOString()),
      sync: "synced",
      repo: current.external?.repo,
      issueNumber: current.external?.issueNumber,
      projectItemId,
      projectUrl: current.external?.projectUrl,
      lastSyncNote: "GitHub project status synced into Qontrol.",
    };

    return persistExternalSync({
      caseId,
      externalTicket: external,
      note: `GitHub board status changed to ${nextStatus}.`,
      actor: "team",
      nextState: mapExternalStatusToCaseState(current.state, nextStatus, "open"),
    });
  }

  return null;
}

