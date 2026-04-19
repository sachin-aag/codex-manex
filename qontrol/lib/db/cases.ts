import {
  type CaseState,
  type Clarity,
  type EmailDraft,
  type ProposedFix,
  type QontrolCase,
  type ResponsibleTeam,
  type Severity,
  type StoryKey,
  type StoryVisualization,
  type TeamTicket,
  type TriageContext,
  type TimelineEvent,
  sourceTypeLabel,
  storyLabel,
} from "@/lib/qontrol-data";
import {
  addIssueToGitHubProject,
  createGitHubIssue,
  getGitHubConfig,
  getGitHubIssue,
  getGitHubProjectUrl,
  listGitHubIssueComments,
  updateGitHubIssue,
} from "@/lib/github";
import { buildGitHubDiscussionSummary } from "@/lib/github-discussion-summary";
import { postgrestRequest } from "@/lib/db/postgrest";
import {
  computeClaimLag,
  computeClaimScatter,
  computeSectionHeatmap,
} from "@/lib/portfolio-data";

type DefectRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string | null;
  product_build_ts: string | null;
  source_type: string | null;
  defect_code: string | null;
  severity: string | null;
  detected_section_name: string | null;
  occurrence_section_name: string | null;
  order_id: string | null;
  reported_part_number: string | null;
  image_url: string | null;
  cost: number | null;
  notes: string | null;
  article_id: string;
  article_name: string | null;
  detected_test_value: number | null;
  detected_test_overall: string | null;
  detected_test_unit: string | null;
  detected_test_name: string | null;
  detected_test_type: string | null;
  detected_test_lower: number | null;
  detected_test_upper: number | null;
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
  product_build_ts: string | null;
  detected_section_name: string | null;
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

type BomPartInstallRow = {
  product_id: string;
  part_number: string;
  part_title: string | null;
  find_number: string | null;
  parent_find_number: string | null;
  batch_id: string;
  batch_number: string | null;
  supplier_name: string | null;
  batch_received_date: string | null;
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

type TestResultRow = {
  test_result_id: string;
  product_id: string;
  ts: string | null;
  test_key: string | null;
  overall_result: string | null;
  test_value: string | null;
  unit: string | null;
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
const UNCLASSIFIED_DEFECT_TYPE = "Unclassified";

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

function normalizeSimilarityKey(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toDefectTypeLabel(value: string | null | undefined) {
  return normalizeSimilarityKey(value) ?? UNCLASSIFIED_DEFECT_TYPE;
}

function mapOwnerTeamToResponsibleTeam(value: string | null | undefined): ResponsibleTeam {
  if (value === "R&D") return "RD";
  if (value === "Supply Chain") return "SC";
  return "MO";
}

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

const severityPriority: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
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

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getHighestSeverity(cases: QontrolCase[]) {
  return cases.reduce<Severity>(
    (highest, caseItem) =>
      severityPriority[caseItem.severity] > severityPriority[highest] ? caseItem.severity : highest,
    cases[0]?.severity ?? "medium",
  );
}

function buildRoutingEmailDraft(params: {
  leadCase: QontrolCase;
  includedCases: QontrolCase[];
  issueUrl: string;
}): EmailDraft {
  const team = ownerTeamByStory[params.leadCase.story];
  const highestSeverity = getHighestSeverity(params.includedCases);
  const responseWindow = severityResponseWindow[highestSeverity];
  const signals = storySignals(params.leadCase.story);
  const caseIds = params.includedCases.map((caseItem) => caseItem.id);
  const recipients = dedupeStrings(params.includedCases.map((caseItem) => teamEmailByStory[caseItem.story]));
  const subject =
    params.includedCases.length === 1
      ? `[${highestSeverity.toUpperCase()}] ${params.leadCase.id}: action required — ${team}`
      : `[${highestSeverity.toUpperCase()}] ${params.includedCases.length} related cases: action required — ${team}`;
  const body =
    `Hi ${team} team,\n\n` +
    (params.includedCases.length === 1
      ? `QM has routed ${params.leadCase.id} to your team for investigation and resolution.\n\n`
      : `QM has grouped ${params.includedCases.length} related Qontrol cases into one shared GitHub ticket for your team.\n\n`) +
    `GitHub ticket: ${params.issueUrl}\n\n` +
    `Included Qontrol cases:\n${caseIds.map((caseId) => `- ${caseId}`).join("\n")}\n\n` +
    `Highest severity: ${highestSeverity.toUpperCase()}\n` +
    `Expected response window: ${responseWindow}\n\n` +
    `Shared context:\n${params.leadCase.summary}\n\n` +
    `Please respond with:\n` +
    `1. Ownership acknowledgement in the GitHub ticket\n` +
    `2. Containment status: ${signals.containment}\n` +
    `3. Permanent fix plan: ${signals.permanentFix}\n` +
    `4. Validation evidence for QM review once the fix is ready\n\n` +
    `Return the GitHub ticket to QM verification after the action plan is complete.\n\n` +
    `Thanks,\n${DEFAULT_QM_OWNER}\nQuality Management`;

  return {
    to: recipients.length > 0 ? recipients : [teamEmailByStory[params.leadCase.story]],
    cc: ["qm@manex.internal"],
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
        { label: "Exposed products", value: "Loading" },
        { label: "Affected products", value: "Loading" },
        { label: "Defects", value: "Loading" },
        { label: "Field claims", value: "Loading" },
      ],
      batchId: "Batch under review",
      supplierName: "Supplier under review",
      receivedDate: null,
      exposedProducts: 0,
      affectedProducts: 0,
      defectRate: 0,
      lagDistribution: emptyLagDistribution(),
      testOutcomes: [
        { label: "PASS", count: 0 },
        { label: "MARGINAL", count: 0, highlight: true },
        { label: "FAIL", count: 0, highlight: true },
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
      lagDistribution: emptyLagDistribution(),
      claimScatter: [],
      fieldOnlyClaims: 0,
      overlappingClaims: 0,
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
      orderMatrix: {
        orders: [],
        operators: ["Operator under review"],
        cells: [],
        maxCount: 1,
      },
      severityMix: [
        { label: "Low", count: 0, highlight: true },
        { label: "Medium", count: 0 },
        { label: "High", count: 0 },
      ],
      actionSnapshot: {
        openActions: 0,
        closedActions: 0,
        latestAction: "No follow-up action logged yet.",
      },
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
    heatmap: {
      cells: [],
      detectedOrder: [],
      occurrenceOrder: [],
      maxCount: 0,
    },
    filteredFalsePositives: 0,
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

function weekStartMondayUtc(value: string | null) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + mondayOffset,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

function bucketLag(days: number | null) {
  if (days == null) return "Unknown";
  if (days < 28) return "0-4 wk";
  if (days < 56) return "4-8 wk";
  if (days < 84) return "8-12 wk";
  return "12+ wk";
}

function isFalsePositiveNote(value: string | null) {
  return value?.toLowerCase().includes("false positive") ?? false;
}

function formatShortDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatQueuePriority(caseItem: QontrolCase, openMatchingCases: number) {
  if (!caseItem.similarityKey) {
    return caseItem.severity === "high"
      ? "P1 attention; no defect-code cluster yet"
      : "No defect-code cluster yet";
  }
  if (caseItem.severity === "high") {
    return `P1 attention across ${openMatchingCases} active ${caseItem.story} case(s)`;
  }
  if (caseItem.story === "handling") {
    return `Low severity, but repeated handling pattern across ${openMatchingCases} active case(s)`;
  }
  return `Route with ${openMatchingCases} active ${caseItem.story} case(s) in view`;
}

function similarTicketPriority(item: QontrolCase) {
  if (item.state === "closed") return 0;
  if (item.state === "returned_to_qm_for_verification") return 1;
  return 2;
}

function getResolutionDays(item: QontrolCase) {
  if (item.state !== "closed") return null;

  const timestamps = item.timeline
    .map((entry) => new Date(entry.at).getTime())
    .filter((value) => Number.isFinite(value));
  const closedAt = new Date(item.lastUpdateAt).getTime();

  if (!Number.isFinite(closedAt) || timestamps.length === 0) return null;

  const openedAt = Math.min(...timestamps);
  const diffDays = Math.round((closedAt - openedAt) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

function formatResolutionTime(item: QontrolCase) {
  const resolutionDays = getResolutionDays(item);
  if (resolutionDays == null) {
    return item.state === "closed" ? "Closed" : "Open";
  }
  return resolutionDays === 1 ? "1 day" : `${resolutionDays} days`;
}

function buildSimilarTickets(
  current: QontrolCase,
  related: QontrolCase[],
): QontrolCase["similarTickets"] {
  return related
    .slice()
    .sort((a, b) => {
      const priorityDiff = similarTicketPriority(a) - similarTicketPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.lastUpdateAt).getTime() - new Date(a.lastUpdateAt).getTime();
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title,
      story: item.story,
      team: item.ownerTeam,
      fixedBy: item.state === "closed" ? item.assignee || item.ownerTeam || item.qmOwner : "-",
      actionTaken: item.proposedFix.permanentFix,
      timeToFix: formatResolutionTime(item),
      resolutionDays: getResolutionDays(item),
      outcome:
        item.state === "closed"
          ? "worked"
          : "open",
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
  const ownerTeam = ownerTeamByStory[story];
  const similarityKey = normalizeSimilarityKey(row.defect_code);
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
    defectType: toDefectTypeLabel(row.defect_code),
    similarityKey,
    responsibleTeam: mapOwnerTeamToResponsibleTeam(ownerTeam),
    clarity: story === "handling" && toSeverity(row.severity) === "low" ? "warning" : "match",
    severity: toSeverity(row.severity),
    costUsd: Number(row.cost ?? 0),
    market: "N/A",
    productId: row.product_id,
    articleId: row.article_id,
    partNumber: row.reported_part_number ?? "Unknown",
    imageUrl: row.image_url,
    ownerTeam,
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
  const ownerTeam = ownerTeamByStory[story];
  const similarityKey = normalizeSimilarityKey(row.mapped_defect_code);
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
    defectType: toDefectTypeLabel(row.mapped_defect_code),
    similarityKey,
    responsibleTeam: mapOwnerTeamToResponsibleTeam(ownerTeam),
    clarity: "match",
    severity: toSeverity(row.mapped_defect_severity),
    costUsd: Number(row.cost ?? 0),
    market: row.market ?? "N/A",
    productId: row.product_id,
    articleId: row.article_id,
    partNumber: row.reported_part_number ?? "Unknown",
    imageUrl: null,
    ownerTeam,
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
  const nextOwnerTeam = state.owner_team ?? base.ownerTeam;
  const severityOverride = extractSeverityOverride(state.state_history);
  return {
    ...base,
    state: nextState,
    assignee: state.assignee ?? base.assignee,
    ownerTeam: nextOwnerTeam,
    responsibleTeam: mapOwnerTeamToResponsibleTeam(nextOwnerTeam),
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

async function fetchBomPartInstalls(partNumbers: string[]): Promise<BomPartInstallRow[]> {
  if (partNumbers.length === 0) return [];
  return postgrestRequest<BomPartInstallRow[]>("v_product_bom_parts", {
    method: "GET",
    query: {
      select:
        "product_id,part_number,part_title,find_number,parent_find_number,batch_id,batch_number,supplier_name,batch_received_date",
      part_number: buildInFilter(partNumbers),
      limit: "10000",
    },
  });
}

async function fetchProductActions(productIds: string[]): Promise<ProductActionRow[]> {
  if (productIds.length === 0) return [];
  return postgrestRequest<ProductActionRow[]>("product_action", {
    method: "GET",
    query: {
      select:
        "action_id,product_id,ts,action_type,status,user_id,section_id,comments,defect_id",
      product_id: buildInFilter(productIds),
      order: "ts.desc",
      limit: "10000",
    },
  });
}

async function fetchStoryTests(productIds: string[]): Promise<TestResultRow[]> {
  if (productIds.length === 0) return [];
  return postgrestRequest<TestResultRow[]>("test_result", {
    method: "GET",
    query: {
      select: "test_result_id,product_id,ts,test_key,overall_result,test_value,unit",
      product_id: buildInFilter(productIds),
      test_key: `in.("ESR_TEST","VIB_TEST")`,
      order: "ts.desc",
      limit: "10000",
    },
  });
}

function buildTriageContext(params: {
  item: QontrolCase;
  matchingCases: QontrolCase[];
  relatedDefects: DefectRow[];
  relatedClaims: ClaimRow[];
  dominantOperator?: string;
  recurringOrders?: string[];
}): TriageContext {
  if (!params.item.similarityKey) {
    return {
      matchingCases: 0,
      openMatchingCases: 0,
      queuePriority: formatQueuePriority(params.item, 0),
      timeSignal: "No defect code is available yet, so Qontrol cannot cluster comparable cases.",
      nextMove: params.item.proposedFix.containment,
    };
  }

  const openMatchingCases = params.matchingCases.filter((entry) => entry.state !== "closed");

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
    matchingCases: params.matchingCases.length,
    openMatchingCases: openMatchingCases.length,
    queuePriority: formatQueuePriority(params.item, openMatchingCases.length),
    timeSignal,
    nextMove: params.item.proposedFix.containment,
  };
}

function emptyLagDistribution() {
  return [
    { label: "0-4 wk", count: 0 },
    { label: "4-8 wk", count: 0 },
    { label: "8-12 wk", count: 0, highlight: true },
    { label: "12+ wk", count: 0 },
  ];
}

function buildSupplierVisualization(params: {
  item: QontrolCase;
  relatedDefects: DefectRow[];
  relatedClaims: ClaimRow[];
  bomParts: BomPartInstallRow[];
  tests: TestResultRow[];
}): StoryVisualization {
  const affectedProducts = new Set([
    ...params.relatedDefects.map((entry) => entry.product_id),
    ...params.relatedClaims.map((entry) => entry.product_id),
  ]);
  const batches = new Map<
    string,
    {
      supplierName: string;
      receivedDate: string | null;
      productIds: Set<string>;
    }
  >();
  for (const row of params.bomParts.filter((entry) => entry.part_number === params.item.partNumber)) {
    const current = batches.get(row.batch_id) ?? {
      supplierName: row.supplier_name ?? "Supplier under review",
      receivedDate: row.batch_received_date,
      productIds: new Set<string>(),
    };
    current.productIds.add(row.product_id);
    batches.set(row.batch_id, current);
  }
  const rankedBatches = Array.from(batches.entries())
    .map(([batchId, value]) => {
      const affected = Array.from(value.productIds).filter((productId) =>
        affectedProducts.has(productId),
      ).length;
      return {
        batchId,
        supplierName: value.supplierName,
        receivedDate: value.receivedDate,
        exposedProducts: value.productIds.size,
        affectedProducts: affected,
      };
    })
    .sort((a, b) => {
      if (b.affectedProducts !== a.affectedProducts) {
        return b.affectedProducts - a.affectedProducts;
      }
      if (b.exposedProducts !== a.exposedProducts) {
        return b.exposedProducts - a.exposedProducts;
      }
      return (b.receivedDate ?? "").localeCompare(a.receivedDate ?? "");
    });
  const primaryBatch = rankedBatches[0];
  const focusProductIds = primaryBatch
    ? new Set(
        params.bomParts
          .filter((entry) => entry.batch_id === primaryBatch.batchId)
          .map((entry) => entry.product_id),
      )
    : affectedProducts;
  const lagDistribution = params.relatedClaims.length
    ? computeClaimLag(
        params.relatedClaims.map((claim) => ({
          field_claim_id: claim.field_claim_id,
          product_id: claim.product_id,
          claim_ts: claim.claim_ts ?? "",
          article_name: claim.article_name ?? params.item.articleId,
          complaint_text: claim.complaint_text,
          reported_part_title: null,
          days_from_build: claim.days_from_build,
          cost: claim.cost,
          market: claim.market,
          product_build_ts: claim.product_build_ts,
        })),
      ).map((row) => ({
        label: row.bucket.replaceAll("–", "-"),
        count: row.cnt,
        highlight: row.bucket.includes("8") || row.bucket.includes("4-8"),
      }))
    : emptyLagDistribution();
  const outcomeCounts = new Map<string, number>([
    ["PASS", 0],
    ["MARGINAL", 0],
    ["FAIL", 0],
  ]);
  for (const row of params.tests) {
    if (row.test_key !== "ESR_TEST") continue;
    if (!focusProductIds.has(row.product_id)) continue;
    const key = row.overall_result === "MARGINAL" || row.overall_result === "FAIL" ? row.overall_result : "PASS";
    outcomeCounts.set(key, (outcomeCounts.get(key) ?? 0) + 1);
  }
  const exposedProducts = primaryBatch?.exposedProducts ?? focusProductIds.size;
  const affectedCount = primaryBatch?.affectedProducts ?? affectedProducts.size;

  return {
    kind: "supplier",
    title: "Supplier blast radius",
    summary:
      primaryBatch?.supplierName != null
        ? `${primaryBatch.supplierName} is the strongest batch-level signal for ${params.item.partNumber}.`
        : `Track the incoming batch signature around ${params.item.partNumber}.`,
    steps: [
      {
        label: "Supplier batch",
        value: primaryBatch?.batchId ?? "Batch under review",
        detail: primaryBatch?.receivedDate
          ? `Received ${formatShortDate(primaryBatch.receivedDate)}`
          : "Latest receipt unknown",
        highlight: true,
      },
      {
        label: "Exposed products",
        value: String(exposedProducts),
      },
      {
        label: "Affected products",
        value: String(affectedCount),
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
    batchId: primaryBatch?.batchId ?? "Batch under review",
    supplierName: primaryBatch?.supplierName ?? "Supplier under review",
    receivedDate: primaryBatch?.receivedDate ?? null,
    exposedProducts,
    affectedProducts: affectedCount,
    defectRate: exposedProducts > 0 ? affectedCount / exposedProducts : 0,
    lagDistribution,
    testOutcomes: [
      { label: "PASS", count: outcomeCounts.get("PASS") ?? 0 },
      { label: "MARGINAL", count: outcomeCounts.get("MARGINAL") ?? 0, highlight: true },
      { label: "FAIL", count: outcomeCounts.get("FAIL") ?? 0, highlight: true },
    ],
    annotations: [
      "Batch-to-defect traceability is more useful than raw line-level counts here.",
      "Use the exposure denominator to decide containment scope before pushing supplier action.",
    ],
  };
}

function buildProcessVisualization(params: {
  item: QontrolCase;
  relatedDefects: DefectRow[];
  tests: TestResultRow[];
}): StoryVisualization {
  const filteredFalsePositives = params.relatedDefects.filter((row) =>
    isFalsePositiveNote(row.notes),
  ).length;
  const relevantDefects = params.relatedDefects.filter(
    (row) => !isFalsePositiveNote(row.notes),
  );
  const trendCounts = new Map<
    string,
    { label: string; defectCount: number; failCount: number; marginalCount: number }
  >();
  const ensureTrend = (key: string, label: string) => {
    const current = trendCounts.get(key);
    if (current) return current;
    const next = {
      label,
      defectCount: 0,
      failCount: 0,
      marginalCount: 0,
    };
    trendCounts.set(key, next);
    return next;
  };
  for (const row of relevantDefects) {
    const key = weekStartMondayUtc(row.defect_ts);
    const current = ensureTrend(key, weekBucketLabel(key));
    current.defectCount += 1;
  }
  for (const row of params.tests) {
    if (row.test_key !== "VIB_TEST") continue;
    if (row.overall_result !== "FAIL" && row.overall_result !== "MARGINAL") continue;
    const key = weekStartMondayUtc(row.ts);
    const current = ensureTrend(key, weekBucketLabel(key));
    if (row.overall_result === "FAIL") current.failCount += 1;
    if (row.overall_result === "MARGINAL") current.marginalCount += 1;
  }
  const trend = Array.from(trendCounts.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);
  const maxCount = trend.reduce(
    (highest, point) =>
      Math.max(highest, point.defectCount, point.failCount, point.marginalCount),
    0,
  );
  const currentBucket = params.item.lastUpdateAt.slice(0, 10);
  const heatmap = computeSectionHeatmap(
    relevantDefects.map((row) => ({
      defect_id: row.defect_id,
      product_id: row.product_id,
      defect_ts: row.defect_ts ?? "",
      defect_code: row.defect_code ?? "",
      severity: row.severity ?? "",
      article_name: row.article_name ?? params.item.articleId,
      detected_section_name: row.detected_section_name,
      occurrence_section_name: row.occurrence_section_name,
      reported_part_title: null,
      cost: row.cost,
      notes: row.notes,
    })),
  );

  return {
    kind: "process",
    title: "Process drift trend",
    summary: "Look for the short-lived spike and the section where it concentrates.",
    section:
      relevantDefects[0]?.occurrence_section_name ??
      relevantDefects[0]?.detected_section_name ??
      "Montage Linie 1",
    trend: trend.map((point) => ({
      label: point.label,
      defectCount: point.defectCount,
      failCount: point.failCount,
      marginalCount: point.marginalCount,
      highlight:
        point.defectCount === maxCount ||
        point.failCount === maxCount ||
        point.marginalCount === maxCount ||
        point.key === currentBucket,
    })),
    heatmap,
    filteredFalsePositives,
    annotations: [
      "Contained, time-boxed spikes are usually stronger evidence than absolute volume.",
      "Treat end-of-line detection hotspots as signal amplifiers, not root cause on their own.",
      ...(filteredFalsePositives > 0
        ? [`${filteredFalsePositives} false-positive inspection event(s) were filtered out.`]
        : []),
    ],
  };
}

function buildDesignVisualization(params: {
  item: QontrolCase;
  relatedClaims: ClaimRow[];
  relatedDefects: DefectRow[];
  bomNodes: BomNodeRow[];
}): StoryVisualization {
  const lagDistribution = params.relatedClaims.length
    ? computeClaimLag(
        params.relatedClaims.map((claim) => ({
          field_claim_id: claim.field_claim_id,
          product_id: claim.product_id,
          claim_ts: claim.claim_ts ?? "",
          article_name: claim.article_name ?? params.item.articleId,
          complaint_text: claim.complaint_text,
          reported_part_title: null,
          days_from_build: claim.days_from_build,
          cost: claim.cost,
          market: claim.market,
          product_build_ts: claim.product_build_ts,
        })),
      ).map((row) => ({
        label: row.bucket.replaceAll("–", "-"),
        count: row.cnt,
        highlight: row.bucket.includes("8"),
      }))
    : emptyLagDistribution();
  const matchedNode = params.bomNodes.find(
    (node) => node.part_number === params.item.partNumber,
  );
  const productHasFactoryDefect = new Set(
    params.relatedDefects
      .filter((row) => !isFalsePositiveNote(row.notes))
      .map((row) => row.product_id),
  );
  const fieldOnlyClaims = params.relatedClaims.filter(
    (claim) => !productHasFactoryDefect.has(claim.product_id),
  ).length;
  const claimScatter = computeClaimScatter(
    params.relatedClaims.map((claim) => ({
      field_claim_id: claim.field_claim_id,
      product_id: claim.product_id,
      claim_ts: claim.claim_ts ?? "",
      article_name: claim.article_name ?? params.item.articleId,
      complaint_text: claim.complaint_text,
      reported_part_title: null,
      days_from_build: claim.days_from_build,
      cost: claim.cost,
      market: claim.market,
      product_build_ts: claim.product_build_ts,
    })),
  ).map((point) => ({
    id: point.id,
    x: point.x,
    y: point.y,
    articleName: point.article_name,
    market: point.market,
    cost: point.cost,
    claimTs: point.claim_ts,
    complaintExcerpt: point.complaint_excerpt,
  }));

  return {
    kind: "design",
    title: "BOM hotspot",
    summary: "Field-only failures with zero factory defects usually point to a design leak.",
    assembly: params.item.partNumber === "PM-00015" ? "Steuerplatine" : "Assembly node",
    findNumber: matchedNode?.find_number ?? (params.item.partNumber === "PM-00015" ? "R33" : "Target node"),
    lagDistribution,
    claimScatter,
    fieldOnlyClaims,
    overlappingClaims: Math.max(0, params.relatedClaims.length - fieldOnlyClaims),
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
  storyReworks: ReworkSummaryRow[];
  productById: Map<string, ProductRow>;
  productActions: ProductActionRow[];
}): StoryVisualization {
  const relevantDefects = params.relatedDefects.filter(
    (entry) => !isFalsePositiveNote(entry.notes),
  );
  const defectTypes = new Set(
    relevantDefects.map((entry) => entry.defect_code).filter(Boolean),
  );
  const operatorCounts = new Map<string, number>();
  for (const row of params.storyReworks) {
    if (!row.user_id) continue;
    operatorCounts.set(row.user_id, (operatorCounts.get(row.user_id) ?? 0) + 1);
  }
  const operators = Array.from(operatorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([operator]) => operator);
  if (!operators.includes(params.dominantOperator)) {
    operators.unshift(params.dominantOperator);
  }
  const orders =
    params.recurringOrders.length > 0
      ? params.recurringOrders
      : Array.from(
          new Set(
            relevantDefects
              .map((entry) => params.productById.get(entry.product_id)?.order_id)
              .filter((value): value is string => Boolean(value)),
          ),
        ).slice(0, 3);
  const cellLookup = new Map<string, { count: number; defectTypes: Set<string> }>();
  const defectsByProduct = new Map<string, Set<string>>();
  for (const defect of relevantDefects) {
    const current = defectsByProduct.get(defect.product_id) ?? new Set<string>();
    if (defect.defect_code) current.add(defect.defect_code);
    defectsByProduct.set(defect.product_id, current);
  }
  for (const rework of params.storyReworks) {
    const orderId = params.productById.get(rework.product_id)?.order_id;
    if (!orderId || !rework.user_id) continue;
    const key = `${orderId}\x00${rework.user_id}`;
    const current = cellLookup.get(key) ?? { count: 0, defectTypes: new Set<string>() };
    current.count += 1;
    for (const defectType of defectsByProduct.get(rework.product_id) ?? []) {
      current.defectTypes.add(defectType);
    }
    cellLookup.set(key, current);
  }
  const cells = orders.flatMap((orderId) =>
    operators.map((operator) => {
      const current = cellLookup.get(`${orderId}\x00${operator}`);
      return {
        order: orderId,
        operator,
        count: current?.count ?? 0,
        defectTypes: Array.from(current?.defectTypes ?? []),
        highlight: operator === params.dominantOperator && (current?.count ?? 0) > 0,
      };
    }),
  );
  const maxCount = Math.max(1, ...cells.map((cell) => cell.count));
  const severityCounts = new Map<string, number>([
    ["Low", 0],
    ["Medium", 0],
    ["High", 0],
  ]);
  for (const defect of relevantDefects) {
    const severity =
      defect.severity === "high" || defect.severity === "critical"
        ? "High"
        : defect.severity === "medium"
          ? "Medium"
          : "Low";
    severityCounts.set(severity, (severityCounts.get(severity) ?? 0) + 1);
  }
  const openActions = params.productActions.filter((row) =>
    row.status === "open" || row.status === "in_progress",
  ).length;
  const closedActions = params.productActions.filter((row) =>
    row.status === "done" || row.status === "closed",
  ).length;
  const latestAction = params.productActions[0]?.comments ??
    params.productActions[0]?.action_type ??
    "No follow-up action logged yet.";

  return {
    kind: "handling",
    title: "Handling correlation",
    summary: "The operator pattern only becomes visible after joining rework back to the recurring orders.",
    operator: params.dominantOperator,
    orderMatrix: {
      orders,
      operators,
      cells,
      maxCount,
    },
    severityMix: [
      { label: "Low", count: severityCounts.get("Low") ?? 0, highlight: true },
      { label: "Medium", count: severityCounts.get("Medium") ?? 0 },
      { label: "High", count: severityCounts.get("High") ?? 0 },
    ],
    actionSnapshot: {
      openActions,
      closedActions,
      latestAction,
    },
    annotations: [
      "Low severity does not mean low learning value when the same operator/order cluster repeats.",
      `Cosmetic defect types in cluster: ${Array.from(defectTypes).filter(Boolean).join(", ") || "pending classification"}.`,
    ],
  };
}

function decorateCase(params: {
  item: QontrolCase;
  allCases: QontrolCase[];
  defects: DefectRow[];
  claims: ClaimRow[];
  tests: TestResultRow[];
  productById: Map<string, ProductRow>;
  reworkByProduct: Map<string, ReworkSummaryRow[]>;
  productActionsByProduct: Map<string, ProductActionRow[]>;
  bomPartsByPart: Map<string, BomPartInstallRow[]>;
  bomNodesByBom: Map<string, BomNodeRow[]>;
}): QontrolCase {
  const matchingCases = (params.item.similarityKey
    ? params.allCases.filter((entry) => entry.similarityKey === params.item.similarityKey)
    : []
  )
    .sort(
      (a, b) =>
        new Date(b.lastUpdateAt).getTime() - new Date(a.lastUpdateAt).getTime(),
    );
  const relatedCases = matchingCases.filter((entry) => entry.id !== params.item.id);
  const matchingProductIds = new Set(matchingCases.map((entry) => entry.productId));

  const relatedDefects = params.item.similarityKey
    ? params.defects.filter(
        (entry) => normalizeSimilarityKey(entry.defect_code) === params.item.similarityKey,
      )
    : [];

  const relatedClaims = params.item.similarityKey
    ? params.claims.filter(
        (entry) =>
          normalizeSimilarityKey(entry.mapped_defect_code) === params.item.similarityKey,
      )
    : [];

  const product = params.productById.get(params.item.productId);
  const reworks = params.reworkByProduct.get(params.item.productId) ?? [];
  const storyReworks = params.item.story === "handling"
    ? Array.from(params.reworkByProduct.entries())
        .filter(([productId]) =>
          matchingProductIds.has(productId),
        )
        .flatMap(([, rows]) => rows)
    : reworks;
  const storyActions = params.item.story === "handling"
    ? Array.from(params.productActionsByProduct.entries())
        .filter(([productId]) => matchingProductIds.has(productId))
        .flatMap(([, rows]) => rows)
        .sort(
          (a, b) => new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime(),
        )
    : params.productActionsByProduct.get(params.item.productId) ?? [];
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
      matchingCases
        .map((entry) => params.productById.get(entry.productId)?.order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 3);

  const triageContext = buildTriageContext({
    item: params.item,
    matchingCases,
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
      bomParts: params.bomPartsByPart.get(params.item.partNumber) ?? [],
      tests: params.tests,
    });
  } else if (params.item.story === "design") {
    visualization = buildDesignVisualization({
      item: params.item,
      relatedClaims,
      relatedDefects,
      bomNodes: params.bomNodesByBom.get(product?.bom_id ?? "") ?? [],
    });
  } else if (params.item.story === "handling") {
    visualization = buildHandlingVisualization({
      relatedDefects,
      recurringOrders,
      dominantOperator,
      storyReworks,
      productById: params.productById,
      productActions: storyActions,
    });
  } else {
    visualization = buildProcessVisualization({
      item: params.item,
      relatedDefects,
      tests: params.tests,
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
    similarTickets: buildSimilarTickets(params.item, relatedCases),
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
          "defect_id,product_id,defect_ts,product_build_ts,source_type,defect_code,severity,detected_section_name,occurrence_section_name,order_id,reported_part_number,image_url,cost,notes,article_id,article_name,detected_test_value,detected_test_overall,detected_test_unit,detected_test_name,detected_test_type,detected_test_lower,detected_test_upper",
        order: "defect_ts.desc",
        limit: "120",
      },
    }),
    postgrestRequest<ClaimRow[]>("v_field_claim_detail", {
      method: "GET",
      query: {
        select:
          "field_claim_id,product_id,claim_ts,market,complaint_text,reported_part_number,cost,mapped_defect_id,mapped_defect_code,mapped_defect_severity,notes,article_id,article_name,product_build_ts,detected_section_name,days_from_build",
        order: "claim_ts.desc",
        limit: "120",
      },
    }),
    fetchOptionalStates(),
  ]);

  const productIds = Array.from(
    new Set([...defects.map((row) => row.product_id), ...claims.map((row) => row.product_id)]),
  );
  const partNumbers = Array.from(
    new Set(
      [...defects.map((row) => row.reported_part_number), ...claims.map((row) => row.reported_part_number)].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const [products, reworks, productActions, tests, bomPartInstalls] = await Promise.all([
    fetchProducts(productIds),
    fetchReworkSummary(productIds),
    fetchProductActions(productIds),
    fetchStoryTests(productIds),
    fetchBomPartInstalls(partNumbers),
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
  const productActionsByProduct = new Map<string, ProductActionRow[]>();
  for (const row of productActions) {
    const current = productActionsByProduct.get(row.product_id) ?? [];
    current.push(row);
    productActionsByProduct.set(row.product_id, current);
  }
  const bomPartsByPart = new Map<string, BomPartInstallRow[]>();
  for (const row of bomPartInstalls) {
    const current = bomPartsByPart.get(row.part_number) ?? [];
    current.push(row);
    bomPartsByPart.set(row.part_number, current);
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
        tests,
        productById,
        reworkByProduct,
        productActionsByProduct,
        bomPartsByPart,
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

async function assignCases(caseIds: string[]) {
  const updatedCases: QontrolCase[] = [];
  for (const caseId of [...new Set(caseIds)]) {
    updatedCases.push(await assignCase(caseId));
  }
  return updatedCases;
}

function canShareGitHubTicket(params: {
  leadCase: QontrolCase;
  candidate: QontrolCase;
}) {
  if (params.candidate.id === params.leadCase.id) return false;
  if (params.candidate.state === "closed") return false;
  if (!params.leadCase.similarityKey || params.candidate.similarityKey !== params.leadCase.similarityKey) {
    return false;
  }
  if (params.candidate.ownerTeam !== params.leadCase.ownerTeam) return false;

  const leadIssueNumber = params.leadCase.external?.issueNumber;
  const candidateIssueNumber = params.candidate.external?.issueNumber;
  if (candidateIssueNumber == null) return true;
  if (leadIssueNumber == null) return false;
  return candidateIssueNumber === leadIssueNumber;
}

async function resolveCombinedRoutingTargets(params: {
  caseId: string;
  requestedCaseIds?: string[];
}) {
  const leadCase = await getCaseById(params.caseId);
  const allCases = await listCases();
  const candidateIds = allCases
    .filter((candidate) => canShareGitHubTicket({ leadCase, candidate }))
    .map((candidate) => candidate.id);
  const requestedIds = [...new Set(params.requestedCaseIds ?? [])];
  const allowedRequestedIds =
    requestedIds.length > 0
      ? requestedIds.filter((candidateId) => candidateIds.includes(candidateId))
      : candidateIds;
  const skippedCaseIds =
    requestedIds.length > 0
      ? requestedIds.filter((candidateId) => !allowedRequestedIds.includes(candidateId))
      : [];

  return {
    leadCase,
    caseIds: [leadCase.id, ...allowedRequestedIds],
    skippedCaseIds,
  };
}

export async function listRdCases(): Promise<QontrolCase[]> {
  const cases = await listCases();
  return cases.filter((c) => c.ownerTeam === "R&D" || c.story === "design");
}

export async function getRdCase(caseId: string): Promise<QontrolCase | null> {
  try {
    const c = await getCaseById(caseId);
    if (c.ownerTeam !== "R&D" && c.story !== "design") {
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

export type RdDecisionOutcome = "acknowledged" | "proposed_fix" | "rejected";

export type RdDecisionPayload = {
  outcome: RdDecisionOutcome;
  classification?: "design" | "not_design";
  proposedFixType?: "spec_change" | "part_change" | "no_action";
  recallScope?: string[];
  note: string;
  actor?: string;
};

export async function submitRdDecision(caseId: string, payload: RdDecisionPayload) {
  const current = await getCaseById(caseId);

  // Encode structured payload in comments so the existing text-based timeline still reads well.
  const commentPayload = {
    decision: payload.outcome,
    classification: payload.classification ?? null,
    proposedFixType: payload.proposedFixType ?? null,
    recallScope: payload.recallScope ?? [],
    note: payload.note,
  };
  const comments = `[R&D ${payload.outcome}] ${payload.note} :: ${JSON.stringify(commentPayload)}`;

  await insertProductAction({
    product_id: current.productId,
    ts: new Date().toISOString(),
    action_type: "design_decision",
    status: payload.outcome,
    user_id: payload.actor ?? "rd",
    section_id: null,
    comments,
    defect_id: caseId.startsWith("DEF-") ? caseId : null,
  });

  // State mapping reuses existing CaseState values so the QM board keeps rendering:
  //   proposed_fix  -> returned_to_qm_for_verification (QM's existing verify column)
  //   acknowledged  -> assigned (stays with R&D, just logged)
  //   rejected      -> unassigned (bounced back to QM inbox for rerouting)
  const nextState: CaseState =
    payload.outcome === "proposed_fix"
      ? "returned_to_qm_for_verification"
      : payload.outcome === "rejected"
      ? "unassigned"
      : "assigned";

  const stateNote =
    payload.outcome === "proposed_fix"
      ? `R&D proposed fix (${payload.proposedFixType ?? "n/a"}). Awaiting QM verification.`
      : payload.outcome === "rejected"
      ? `R&D rejected routing: ${payload.note}`
      : `R&D acknowledged: ${payload.note}`;

  await upsertCaseState({
    caseId,
    productId: current.productId,
    defectId: caseId.startsWith("DEF-") ? caseId : null,
    state: nextState,
    assignee: payload.outcome === "rejected" ? null : current.assignee,
    ownerTeam: payload.outcome === "rejected" ? null : current.ownerTeam,
    qmOwner: current.qmOwner,
    note: stateNote,
    actor: "rd",
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

function getPublicBaseUrl() {
  return process.env.QONTROL_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null;
}

function buildCaseUrl(caseId: string) {
  const base = getPublicBaseUrl();
  return base ? `${base}/?case=${encodeURIComponent(caseId)}` : null;
}

function buildCaseImageUrl(imagePath: string | null) {
  const base = getPublicBaseUrl();
  return base && imagePath ? `${base}/api/images?path=${encodeURIComponent(imagePath)}` : null;
}

function buildGitHubIssueLabels(params: {
  severity: Severity;
  existingLabels?: string[];
}) {
  const desiredSeverityLabel = `severity:${params.severity}`;
  const preservedLabels = (params.existingLabels ?? []).filter(
    (label) => !label.toLowerCase().startsWith("severity:"),
  );

  return [...new Set([...preservedLabels, desiredSeverityLabel])];
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function outcomeCount(points: Array<{ label: string; count: number }>, label: string) {
  return points.find((point) => point.label === label)?.count ?? 0;
}

function escapeMermaidLabel(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "'")
    .replaceAll("\n", "<br/>");
}

function buildMermaidDiagram(
  nodes: Array<{ id: string; label: string }>,
  links: Array<{ from: string; to: string; label: string }>,
) {
  return [
    "```mermaid",
    "flowchart LR",
    ...nodes.map((node) => `    ${node.id}["${escapeMermaidLabel(node.label)}"]`),
    "",
    ...links.map((link) => `    ${link.from} -->|${escapeMermaidLabel(link.label)}| ${link.to}`),
    "```",
  ];
}

function buildVisualizationDiagram(visualization: StoryVisualization) {
  if (visualization.kind === "supplier") {
    return buildMermaidDiagram(
      [
        { id: "batch", label: `Supplier batch\n${visualization.batchId}\n${visualization.supplierName}` },
        { id: "exposure", label: `Exposure\n${visualization.exposedProducts} products in cohort` },
        {
          id: "tests",
          label: `ESR signal\n${outcomeCount(visualization.testOutcomes, "MARGINAL")} marginal / ${outcomeCount(visualization.testOutcomes, "FAIL")} fail`,
        },
        { id: "pattern", label: `Pattern\nIncoming material issue\n${visualization.batchId}` },
        {
          id: "factory",
          label: `Factory signal\n${visualization.steps.find((step) => step.label === "In-factory defects")?.value ?? "0"} defects`,
        },
        {
          id: "field",
          label: `Field impact\n${visualization.steps.find((step) => step.label === "Field claims")?.value ?? "0"} claims`,
        },
      ],
      [
        { from: "batch", to: "pattern", label: "traceable" },
        { from: "exposure", to: "pattern", label: "installed into" },
        { from: "tests", to: "pattern", label: "supports" },
        { from: "pattern", to: "factory", label: "drives" },
        { from: "factory", to: "field", label: "escapes to field" },
      ],
    );
  }

  if (visualization.kind === "process") {
    const peakPoint = [...visualization.trend].sort(
      (a, b) =>
        b.defectCount + b.failCount + b.marginalCount - (a.defectCount + a.failCount + a.marginalCount),
    )[0];

    return buildMermaidDiagram(
      [
        { id: "section", label: `Occurrence section\n${visualization.section}` },
        {
          id: "testSignal",
          label: `VIB_TEST signal\n${peakPoint?.marginalCount ?? 0} marginal / ${peakPoint?.failCount ?? 0} fail`,
        },
        {
          id: "noise",
          label: `Noise filter\n${visualization.filteredFalsePositives} false positives removed`,
        },
        { id: "pattern", label: "Pattern\nCalibration drift\nat assembly step" },
        { id: "spike", label: `Spike\n${peakPoint?.defectCount ?? 0} peak-week defects` },
        { id: "gate", label: "Detection gate\nCaught late at Pruefung Linie 2" },
      ],
      [
        { from: "section", to: "pattern", label: "originates in" },
        { from: "testSignal", to: "pattern", label: "warns of" },
        { from: "noise", to: "pattern", label: "clarifies" },
        { from: "pattern", to: "spike", label: "creates" },
        { from: "spike", to: "gate", label: "caught at" },
      ],
    );
  }

  if (visualization.kind === "design") {
    const dominantLag = [...visualization.lagDistribution].sort((a, b) => b.count - a.count)[0];

    return buildMermaidDiagram(
      [
        { id: "article", label: `Article\n${visualization.claimScatter.length} field claims` },
        { id: "bom", label: `BOM hotspot\n${visualization.assembly}\n${visualization.findNumber}` },
        {
          id: "negative",
          label: `Negative evidence\n${visualization.fieldOnlyClaims} field-only claims`,
        },
        { id: "pattern", label: "Pattern\nLatent design weakness\nthermal drift over time" },
        { id: "window", label: `Failure window\n${dominantLag?.label ?? "8-12 wk"} customer-use delay` },
        { id: "field", label: `Field impact\n${visualization.claimScatter.length} reported claims` },
      ],
      [
        { from: "article", to: "pattern", label: "appears on" },
        { from: "bom", to: "pattern", label: "centered at" },
        { from: "negative", to: "pattern", label: "implies" },
        { from: "pattern", to: "window", label: "emerges as" },
        { from: "window", to: "field", label: "surfaces in" },
      ],
    );
  }

  const dominantSeverity =
    [...visualization.severityMix].sort((a, b) => b.count - a.count)[0]?.label ?? "Low";
  const topMatrixCell = [...visualization.orderMatrix.cells].sort((a, b) => b.count - a.count)[0];

  return buildMermaidDiagram(
    [
      {
        id: "orders",
        label: `Recurring orders\n${visualization.orderMatrix.orders.slice(0, 3).join("\n") || "Order cluster pending"}`,
      },
      { id: "operator", label: `Dominant operator\n${visualization.operator}` },
      { id: "severity", label: `Severity mix\n${dominantSeverity}-severity cosmetic pattern` },
      { id: "pattern", label: "Pattern\nHandling correlation\nacross repeat orders" },
      {
        id: "cluster",
        label: `Defect cluster\n${topMatrixCell?.count ?? 0} strongest matrix links`,
      },
      {
        id: "actions",
        label: `Follow-up\n${visualization.actionSnapshot.closedActions} closed / ${visualization.actionSnapshot.openActions} open`,
      },
    ],
    [
      { from: "orders", to: "pattern", label: "repeat across" },
      { from: "operator", to: "pattern", label: "linked to" },
      { from: "severity", to: "pattern", label: "narrows to" },
      { from: "pattern", to: "cluster", label: "shows as" },
      { from: "cluster", to: "actions", label: "tracked by" },
    ],
  );
}

function buildVisualizationFacts(visualization: StoryVisualization) {
  if (visualization.kind === "supplier") {
    const dominantLag = [...visualization.lagDistribution].sort((a, b) => b.count - a.count)[0];
    return [
      `${visualization.affectedProducts} of ${visualization.exposedProducts} exposed products were affected (${Math.round(visualization.defectRate * 100)}% hit rate).`,
      `Dominant field-claim lag bucket: ${dominantLag?.label ?? "not enough evidence yet"}.`,
      `ESR outcomes on the cohort: ${outcomeCount(visualization.testOutcomes, "MARGINAL")} marginal and ${outcomeCount(visualization.testOutcomes, "FAIL")} fail.`,
    ];
  }

  if (visualization.kind === "process") {
    const peakPoint = [...visualization.trend].sort(
      (a, b) =>
        b.defectCount + b.failCount + b.marginalCount - (a.defectCount + a.failCount + a.marginalCount),
    )[0];

    return [
      `Focus section: ${visualization.section}.`,
      `Peak week ${peakPoint?.label ?? "unknown"} carried ${peakPoint?.defectCount ?? 0} defects with ${peakPoint?.failCount ?? 0} fail and ${peakPoint?.marginalCount ?? 0} marginal test signals.`,
      `${visualization.filteredFalsePositives} false-positive inspection events were filtered out before pattern scoring.`,
    ];
  }

  if (visualization.kind === "design") {
    const dominantLag = [...visualization.lagDistribution].sort((a, b) => b.count - a.count)[0];
    return [
      `BOM hotspot centers on ${visualization.assembly} / ${visualization.findNumber}.`,
      `${visualization.fieldOnlyClaims} field-only claims point to a latent issue that does not reproduce cleanly in factory data.`,
      `Likeliest failure window is ${dominantLag?.label ?? "not enough evidence yet"} after build.`,
    ];
  }

  const dominantSeverity =
    [...visualization.severityMix].sort((a, b) => b.count - a.count)[0]?.label ?? "Low";

  return [
    `Dominant operator in the cluster: ${visualization.operator}.`,
    `Repeat-order scope: ${visualization.orderMatrix.orders.length} order(s) in the active pattern.`,
    `Most common severity in the cluster is ${dominantSeverity}, with ${visualization.actionSnapshot.closedActions} closed and ${visualization.actionSnapshot.openActions} open follow-ups.`,
  ];
}

function buildGitHubIssueTitle(cases: QontrolCase[]) {
  const leadCase = cases[0];
  const highestSeverity = getHighestSeverity(cases);
  if (cases.length === 1) {
    return `[${highestSeverity.toUpperCase()}] ${leadCase.id} - ${leadCase.title}`;
  }

  const patternLabel = leadCase.similarityKey ?? leadCase.defectType;
  return `[${highestSeverity.toUpperCase()}] ${cases.length} related cases - ${patternLabel}`;
}

function buildSingleGitHubIssueBody(caseItem: QontrolCase) {
  const caseUrl = buildCaseUrl(caseItem.id);
  const imageUrl = buildCaseImageUrl(caseItem.imageUrl);
  const similarClosedTickets = caseItem.similarTickets.filter((ticket) => ticket.outcome === "worked").slice(0, 3);
  const lines = [
    "## Engineering Snapshot",
    "",
    `- Case ID: ${caseItem.id}`,
    `- Severity: ${caseItem.severity.toUpperCase()}`,
    `- Routed team: ${caseItem.ownerTeam}`,
    `- Source: ${sourceTypeLabel[caseItem.sourceType]}`,
    `- Failure mode: ${storyLabel[caseItem.story]}`,
    `- Product: ${caseItem.productId}`,
    `- Article / Part: ${caseItem.articleId} / ${caseItem.partNumber}`,
    `- Estimated cost exposure: ${formatUsd(caseItem.costUsd)}`,
    `- Queue priority: ${caseItem.triageContext.queuePriority}`,
    `- Matching open cases: ${caseItem.triageContext.openMatchingCases}`,
    "",
    "## Problem Statement",
    "",
    caseItem.summary,
    "",
    "## Why This Reached Engineering",
    "",
    ...caseItem.routingWhy.map((entry) => `- ${entry}`),
    "",
    "## Failure Model",
    "",
    caseItem.visualization.summary,
    "",
    ...buildVisualizationDiagram(caseItem.visualization),
    "",
    "## Supporting Evidence",
    "",
    ...buildVisualizationFacts(caseItem.visualization).map((entry) => `- ${entry}`),
    ...caseItem.visualization.annotations.map((entry) => `- ${entry}`),
    ...caseItem.evidenceTrail.slice(0, 6).map((entry) => `- ${entry}`),
  ];

  if (imageUrl) {
    lines.push("", "## Defect Image", "", `![Defect image for ${caseItem.id}](${imageUrl})`);
  }

  lines.push("", "## Open Questions / Missing Evidence", "");

  if (caseItem.missingEvidence.length > 0) {
    lines.push(...caseItem.missingEvidence.map((entry) => `- ${entry}`));
  } else {
    lines.push("- No additional missing-evidence blockers were captured in Qontrol.");
  }

  lines.push(
    "",
    "## Proposed Fix",
    "",
    "### Containment",
    caseItem.proposedFix.containment,
    "",
    "### Permanent Fix",
    caseItem.proposedFix.permanentFix,
    "",
    "### Validation / Exit Criteria",
    caseItem.proposedFix.validation,
    "",
    "### Confidence",
    `- ${caseItem.proposedFix.confidence}`,
    ...caseItem.proposedFix.basis.map((entry) => `- ${entry}`),
  );

  if (similarClosedTickets.length > 0) {
    lines.push("", "## Similar Resolved Tickets", "");
    lines.push(
      ...similarClosedTickets.flatMap((ticket) => [
        `### ${ticket.id} - ${ticket.title}`,
        `- Team: ${ticket.team}`,
        `- Fixed by: ${ticket.fixedBy}`,
        `- Time to fix: ${ticket.timeToFix}`,
        `- Reusable action: ${ticket.actionTaken}`,
        `- Learning: ${ticket.learning}`,
        "",
      ]),
    );
  }

  if (caseUrl) {
    lines.push("", "## Reference Links", "", `- Qontrol case: ${caseUrl}`);
  }

  return lines.join("\n");
}

function buildCombinedGitHubIssueBody(cases: QontrolCase[]) {
  const leadCase = cases[0];
  const highestSeverity = getHighestSeverity(cases);
  const aggregateCost = cases.reduce((total, caseItem) => total + caseItem.costUsd, 0);
  const sharedEvidence = dedupeStrings(cases.flatMap((caseItem) => caseItem.evidenceTrail)).slice(0, 10);
  const sharedQuestions = dedupeStrings(cases.flatMap((caseItem) => caseItem.missingEvidence));
  const sharedRoutingWhy = dedupeStrings(cases.flatMap((caseItem) => caseItem.routingWhy));
  const similarClosedTickets = leadCase.similarTickets.filter((ticket) => ticket.outcome === "worked").slice(0, 3);
  const caseLinks = cases.map((caseItem) => ({
    id: caseItem.id,
    url: buildCaseUrl(caseItem.id),
  }));
  const imageLinks = cases
    .map((caseItem) => ({
      id: caseItem.id,
      url: buildCaseImageUrl(caseItem.imageUrl),
    }))
    .filter((entry): entry is { id: string; url: string } => Boolean(entry.url))
    .slice(0, 3);

  const lines = [
    "## Engineering Snapshot",
    "",
    `- Shared GitHub ticket for ${cases.length} related Qontrol cases`,
    `- Highest severity: ${highestSeverity.toUpperCase()}`,
    `- Routed team: ${leadCase.ownerTeam}`,
    `- Pattern: ${storyLabel[leadCase.story]}`,
    `- Similarity key: ${leadCase.similarityKey ?? leadCase.defectType}`,
    `- Aggregate cost exposure: ${formatUsd(aggregateCost)}`,
    `- Included case IDs: ${cases.map((caseItem) => caseItem.id).join(", ")}`,
    "",
    "## Problem Statement",
    "",
    `Qontrol grouped ${cases.length} open related cases into one engineering handoff so the downstream team can investigate one shared failure pattern instead of parallel duplicates.`,
    "",
    leadCase.summary,
    "",
    "## Included Cases",
    "",
    ...cases.flatMap((caseItem) => [
      `### ${caseItem.id} - ${caseItem.title}`,
      `- Severity: ${caseItem.severity.toUpperCase()}`,
      `- State: ${caseItem.state.replaceAll("_", " ")}`,
      `- Product: ${caseItem.productId}`,
      `- Article / Part: ${caseItem.articleId} / ${caseItem.partNumber}`,
      `- Summary: ${caseItem.summary}`,
      "",
    ]),
    "## Why These Cases Were Grouped",
    "",
    ...sharedRoutingWhy.map((entry) => `- ${entry}`),
    "",
    "## Failure Model",
    "",
    leadCase.visualization.summary,
    "",
    ...buildVisualizationDiagram(leadCase.visualization),
    "",
    "## Supporting Evidence",
    "",
    ...buildVisualizationFacts(leadCase.visualization).map((entry) => `- ${entry}`),
    ...leadCase.visualization.annotations.map((entry) => `- ${entry}`),
    ...sharedEvidence.map((entry) => `- ${entry}`),
  ];

  if (imageLinks.length > 0) {
    lines.push("", "## Defect Images", "");
    lines.push(...imageLinks.map((entry) => `![Defect image for ${entry.id}](${entry.url})`), "");
  }

  lines.push("", "## Open Questions / Missing Evidence", "");

  if (sharedQuestions.length > 0) {
    lines.push(...sharedQuestions.map((entry) => `- ${entry}`));
  } else {
    lines.push("- No additional missing-evidence blockers were captured in Qontrol.");
  }

  lines.push(
    "",
    "## Proposed Fix / Exit Criteria",
    "",
    "### Containment",
    leadCase.proposedFix.containment,
    "",
    "### Permanent Fix",
    leadCase.proposedFix.permanentFix,
    "",
    "### Validation / Exit Criteria",
    leadCase.proposedFix.validation,
    "",
    "### Confidence",
    `- ${leadCase.proposedFix.confidence}`,
    ...leadCase.proposedFix.basis.map((entry) => `- ${entry}`),
  );

  if (similarClosedTickets.length > 0) {
    lines.push("", "## Similar Resolved Tickets", "");
    lines.push(
      ...similarClosedTickets.flatMap((ticket) => [
        `### ${ticket.id} - ${ticket.title}`,
        `- Team: ${ticket.team}`,
        `- Fixed by: ${ticket.fixedBy}`,
        `- Time to fix: ${ticket.timeToFix}`,
        `- Reusable action: ${ticket.actionTaken}`,
        `- Learning: ${ticket.learning}`,
        "",
      ]),
    );
  }

  lines.push("", "## Reference Links", "");
  lines.push(
    ...caseLinks.map((entry) =>
      entry.url ? `- ${entry.id}: ${entry.url}` : `- ${entry.id}`,
    ),
  );

  return lines.join("\n");
}

function buildGitHubIssueBody(caseItem: QontrolCase, cases: QontrolCase[] = [caseItem]) {
  return cases.length > 1 ? buildCombinedGitHubIssueBody(cases) : buildSingleGitHubIssueBody(caseItem);
}

function shouldAddCaseToGitHubBoard(caseItem: QontrolCase) {
  return caseItem.ownerTeam === "R&D";
}

function buildExternalTicket(params: {
  caseItem: QontrolCase;
  issue: Awaited<ReturnType<typeof getGitHubIssue>>;
  projectItemId?: number;
  status?: string;
  assignee?: string;
  sync?: TeamTicket["sync"];
  syncNote?: string;
  repo?: string;
  discussionSummary?: string | null;
  discussionUpdatedAt?: string | null;
}) {
  const config = getGitHubConfig();
  const projectItemId = params.projectItemId ?? params.caseItem.external?.projectItemId;
  return {
    system: "GitHub" as const,
    ticketId: `#${params.issue.number}`,
    urlLabel: "Open GitHub issue",
    url: params.issue.html_url,
    status: params.status ?? (params.issue.state === "closed" ? "Ready for QM verification" : "Open"),
    assignee: params.assignee ?? params.issue.assignees[0]?.login ?? params.caseItem.assignee,
    lastUpdate: formatExternalTimestamp(params.issue.updated_at),
    sync: params.sync ?? "synced",
    repo: params.repo ?? config.repoSlug,
    issueNumber: params.issue.number,
    projectItemId,
    projectUrl: projectItemId ? getGitHubProjectUrl() : undefined,
    lastSyncNote: params.syncNote,
    discussionSummary: params.discussionSummary ?? params.caseItem.external?.discussionSummary,
    discussionUpdatedAt:
      params.discussionSummary && params.discussionUpdatedAt
        ? formatExternalTimestamp(params.discussionUpdatedAt)
        : params.caseItem.external?.discussionUpdatedAt,
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

function extractCaseIdsFromGitHubBody(body?: string | null) {
  if (!body) return [];
  return [...body.matchAll(/\b(?:DEF|FC)-\d{5}\b/gi)].map((match) => match[0].toUpperCase());
}

async function findCaseIdsByGitHubIssue(params: {
  issueNumber?: number;
  repo?: string;
  body?: string | null;
}) {
  const states = await fetchOptionalStates();
  const caseIds = new Set<string>();

  states.forEach((entry) => {
    const external = entry.external_ticket;
    if (!external?.issueNumber) return;
    if (params.issueNumber !== external.issueNumber) return;
    if (params.repo && external.repo && params.repo.toLowerCase() !== external.repo.toLowerCase()) {
      return;
    }
    caseIds.add(entry.case_id);
  });

  extractCaseIdsFromGitHubBody(params.body).forEach((caseId) => {
    caseIds.add(caseId);
  });

  return [...caseIds];
}

async function findCaseIdsByProjectItem(projectItemId: number) {
  const states = await fetchOptionalStates();
  return states
    .filter((entry) => entry.external_ticket?.projectItemId === projectItemId)
    .map((entry) => entry.case_id);
}

async function loadGitHubDiscussionSnapshot(issue: Awaited<ReturnType<typeof getGitHubIssue>>) {
  const comments = await listGitHubIssueComments(issue.number, { perPage: 12 });
  const discussionSummary = await buildGitHubDiscussionSummary({
    issueTitle: issue.title,
    issueBody: issue.body,
    comments,
  });

  return {
    discussionSummary,
    discussionUpdatedAt:
      discussionSummary != null
        ? (comments[0]?.updated_at ?? comments[0]?.created_at ?? issue.updated_at)
        : null,
  };
}

function resolveGitHubIssueStatus(
  currentStatus: string | undefined,
  issueState: "open" | "closed",
) {
  if (issueState === "closed") {
    return "Ready for QM verification";
  }
  if (currentStatus && !currentStatus.toLowerCase().includes("ready for qm")) {
    return currentStatus;
  }
  return "Open";
}

async function persistExternalSync(params: {
  caseId: string;
  externalTicket: TeamTicket;
  note: string;
  actor?: string;
  nextState?: CaseState;
  caseAssignee?: string | null;
}) {
  const current = await getCaseById(params.caseId);
  await upsertCaseState({
    caseId: params.caseId,
    productId: current.productId,
    defectId: params.caseId.startsWith("DEF-") ? params.caseId : null,
    state: params.nextState ?? current.state,
    assignee:
      params.caseAssignee !== undefined
        ? params.caseAssignee
        : params.externalTicket.assignee && params.externalTicket.assignee !== "Unassigned"
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

async function syncGitHubIssueAcrossCases(params: {
  caseIds: string[];
  issue: Awaited<ReturnType<typeof getGitHubIssue>>;
  repo: string;
  note: string;
  syncNote: string;
  actor?: string;
  projectItemId?: number;
  discussionSummary?: string | null;
  discussionUpdatedAt?: string | null;
  resolveStatus?: (current: QontrolCase) => string;
  resolveNextState?: (current: QontrolCase, external: TeamTicket) => CaseState;
  resolveCaseAssignee?: (current: QontrolCase, external: TeamTicket) => string | null | undefined;
}) {
  let firstUpdated: QontrolCase | null = null;
  const uniqueCaseIds = [...new Set(params.caseIds)];

  for (const linkedCaseId of uniqueCaseIds) {
    let current: QontrolCase;
    try {
      current = await getCaseById(linkedCaseId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Case not found:")) {
        continue;
      }
      throw error;
    }
    const external = buildExternalTicket({
      caseItem: current,
      issue: params.issue,
      projectItemId: params.projectItemId,
      repo: params.repo,
      status:
        params.resolveStatus?.(current) ??
        resolveGitHubIssueStatus(current.external?.status, params.issue.state),
      syncNote: params.syncNote,
      discussionSummary: params.discussionSummary,
      discussionUpdatedAt: params.discussionUpdatedAt,
    });

    const updated = await persistExternalSync({
      caseId: linkedCaseId,
      externalTicket: external,
      note: params.note,
      actor: params.actor,
      nextState:
        params.resolveNextState?.(current, external) ??
        mapExternalStatusToCaseState(current.state, external.status, params.issue.state),
      caseAssignee: params.resolveCaseAssignee?.(current, external),
    });

    firstUpdated ??= updated;
  }

  return firstUpdated;
}

async function loadCasesByIds(caseIds: string[]) {
  const loadedCases: QontrolCase[] = [];
  for (const caseId of [...new Set(caseIds)]) {
    loadedCases.push(await getCaseById(caseId));
  }
  return loadedCases;
}

async function connectCasesToGitHub(caseIds: string[]) {
  let requestedCaseIds = [...new Set(caseIds)];
  let loadedCases = await loadCasesByIds(requestedCaseIds);
  const leadCase = loadedCases[0];
  if (!leadCase) {
    throw new Error("No cases supplied for GitHub routing.");
  }

  if (requestedCaseIds.length === 1 && leadCase.external?.issueNumber != null) {
    const existingLinkedIssue = await getGitHubIssue(leadCase.external.issueNumber);
    const linkedCaseIds = await findCaseIdsByGitHubIssue({
      issueNumber: existingLinkedIssue.number,
      repo: leadCase.external.repo,
      body: existingLinkedIssue.body ?? null,
    });

    if (linkedCaseIds.length > 1) {
      requestedCaseIds = [...new Set(linkedCaseIds)];
      loadedCases = await loadCasesByIds(requestedCaseIds);
    }
  }

  const canonicalCase = loadedCases[0];
  const existingIssueNumbers = [
    ...new Set(
      loadedCases
        .map((caseItem) => caseItem.external?.issueNumber)
        .filter((issueNumber): issueNumber is number => issueNumber != null),
    ),
  ];

  if (existingIssueNumbers.length > 1) {
    throw new Error(
      "Selected cases already map to multiple GitHub issues. Update them separately or consolidate the links first.",
    );
  }

  const existingIssue =
    existingIssueNumbers[0] != null ? await getGitHubIssue(existingIssueNumbers[0]) : null;
  const title = buildGitHubIssueTitle(loadedCases);
  const body = buildGitHubIssueBody(canonicalCase, loadedCases);
  const labels = buildGitHubIssueLabels({
    severity: getHighestSeverity(loadedCases),
    existingLabels: existingIssue?.labels.map((label) => label.name),
  });

  const issue =
    existingIssue != null
      ? await updateGitHubIssue(existingIssue.number, { title, body, labels })
      : await createGitHubIssue({ title, body, labels });

  const existingProjectItemId = loadedCases.find((caseItem) => caseItem.external?.projectItemId != null)
    ?.external?.projectItemId;
  const projectItem =
    shouldAddCaseToGitHubBoard(canonicalCase)
      ? existingProjectItemId != null
        ? { id: existingProjectItemId }
        : await addIssueToGitHubProject(issue.number)
      : null;

  await syncGitHubIssueAcrossCases({
    caseIds: requestedCaseIds,
    issue,
    repo: canonicalCase.external?.repo ?? getGitHubConfig().repoSlug,
    note:
      existingIssue != null
        ? `GitHub issue #${issue.number} updated from Qontrol.`
        : `GitHub issue #${issue.number} created for outbound handoff.`,
    actor: "system",
    syncNote:
      existingIssue != null
        ? "GitHub issue refreshed from Qontrol."
        : "GitHub issue created from Qontrol.",
    projectItemId: projectItem?.id,
    resolveStatus: () => (issue.state === "closed" ? "Ready for QM verification" : "Open"),
    resolveNextState: (current) => (current.state === "unassigned" ? "assigned" : current.state),
  });

  return loadCasesByIds(requestedCaseIds);
}

export async function connectCaseToGitHub(caseId: string) {
  const updatedCases = await connectCasesToGitHub([caseId]);
  return updatedCases.find((caseItem) => caseItem.id === caseId) ?? updatedCases[0];
}

export async function routeCase(params: {
  caseId: string;
  createCombinedTicket?: boolean;
  linkedCaseIds?: string[];
  openEmailDraft?: boolean;
}) {
  const warningParts: string[] = [];
  let targetCaseIds = [params.caseId];

  if (params.createCombinedTicket) {
    const resolvedTargets = await resolveCombinedRoutingTargets({
      caseId: params.caseId,
      requestedCaseIds: params.linkedCaseIds,
    });
    targetCaseIds = resolvedTargets.caseIds;

    if (targetCaseIds.length === 1) {
      warningParts.push(
        "No additional eligible related tickets were available, so Qontrol routed this as a single GitHub issue.",
      );
    }

    if (resolvedTargets.skippedCaseIds.length > 0) {
      warningParts.push(
        `Excluded related tickets already linked elsewhere or no longer matching the active cluster: ${resolvedTargets.skippedCaseIds.join(", ")}.`,
      );
    }
  }

  const assignedCases = await assignCases(targetCaseIds);

  try {
    const syncedCases = await connectCasesToGitHub(targetCaseIds);
    const selectedCase = syncedCases.find((caseItem) => caseItem.id === params.caseId) ?? syncedCases[0];
    const emailDraft =
      params.openEmailDraft && selectedCase?.external?.url
        ? buildRoutingEmailDraft({
            leadCase: selectedCase,
            includedCases: syncedCases,
            issueUrl: selectedCase.external.url,
          })
        : undefined;

    return {
      cases: syncedCases,
      emailDraft,
      warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    warningParts.push(
      `Case${targetCaseIds.length > 1 ? "s" : ""} routed, but GitHub issue sync failed: ${message}`,
    );

    return {
      cases: assignedCases,
      warning: warningParts.join(" "),
    };
  }
}

export async function syncCaseFromGitHub(caseId: string) {
  const current = await getCaseById(caseId);
  if (!current.external?.issueNumber) {
    throw new Error("Case is not linked to a GitHub issue yet.");
  }

  const issue = await getGitHubIssue(current.external.issueNumber);
  const linkedCaseIds = await findCaseIdsByGitHubIssue({
    issueNumber: issue.number,
    repo: current.external.repo,
    body: issue.body ?? null,
  });
  const discussion = await loadGitHubDiscussionSnapshot(issue);

  return syncGitHubIssueAcrossCases({
    caseIds: linkedCaseIds.length > 0 ? linkedCaseIds : [caseId],
    issue,
    repo: current.external.repo ?? getGitHubConfig().repoSlug,
    note: `GitHub issue #${issue.number} synced back into Qontrol.`,
    actor: "system",
    syncNote: "Manual sync pulled latest GitHub state.",
    discussionSummary: discussion.discussionSummary,
    discussionUpdatedAt: discussion.discussionUpdatedAt,
    resolveStatus: (linkedCase) =>
      resolveGitHubIssueStatus(linkedCase.external?.status, issue.state),
    resolveNextState: (linkedCase, external) =>
      mapExternalStatusToCaseState(linkedCase.state, external.status, issue.state),
    resolveCaseAssignee:
      issue.state === "closed"
        ? (linkedCase) => linkedCase.qmOwner
        : undefined,
  });
}

export async function backfillGitHubDiscussionSummaries() {
  const states = await fetchOptionalStates();
  const issuesByKey = new Map<string, string>();

  for (const entry of states) {
    const external = entry.external_ticket;
    if (external?.system !== "GitHub" || !external.issueNumber) {
      continue;
    }

    const repo = external.repo ?? getGitHubConfig().repoSlug;
    const key = `${repo}#${external.issueNumber}`;
    if (!issuesByKey.has(key)) {
      issuesByKey.set(key, entry.case_id);
    }
  }

  for (const caseId of issuesByKey.values()) {
    await syncCaseFromGitHub(caseId);
  }

  return {
    syncedIssueCount: issuesByKey.size,
  };
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

    const caseIds = await findCaseIdsByGitHubIssue({
      issueNumber: issue.number,
      repo: repository.full_name,
      body: issue.body ?? null,
    });
    if (caseIds.length === 0) return null;

    const canonicalIssue = await getGitHubIssue(issue.number);
    const discussion = await loadGitHubDiscussionSnapshot(canonicalIssue);

    return syncGitHubIssueAcrossCases({
      caseIds,
      issue: canonicalIssue,
      repo: repository.full_name,
      note: `GitHub issue ${String(payload.action ?? "updated")} on #${issue.number}.`,
      actor: "system",
      syncNote: `GitHub issue ${String(payload.action ?? "updated")} webhook received.`,
      discussionSummary: discussion.discussionSummary,
      discussionUpdatedAt: discussion.discussionUpdatedAt,
      resolveStatus: (current) =>
        resolveGitHubIssueStatus(current.external?.status, canonicalIssue.state),
      resolveNextState: (current, external) =>
        mapExternalStatusToCaseState(current.state, external.status, canonicalIssue.state),
      resolveCaseAssignee:
        canonicalIssue.state === "closed"
          ? (current) => current.qmOwner
          : undefined,
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

    const caseIds = await findCaseIdsByGitHubIssue({
      issueNumber: issue.number,
      repo: repository.full_name,
      body: issue.body ?? null,
    });
    if (caseIds.length === 0) return null;

    const canonicalIssue = await getGitHubIssue(issue.number);
    const discussion = await loadGitHubDiscussionSnapshot(canonicalIssue);

    return syncGitHubIssueAcrossCases({
      caseIds,
      issue: canonicalIssue,
      repo: repository.full_name,
      note: `GitHub comment received: ${comment.body.slice(0, 180)}`,
      actor: "team",
      syncNote: "GitHub comment synced into Qontrol timeline.",
      discussionSummary: discussion.discussionSummary,
      discussionUpdatedAt: discussion.discussionUpdatedAt,
      resolveStatus: (current) =>
        resolveGitHubIssueStatus(current.external?.status, canonicalIssue.state),
      resolveNextState: (current, external) =>
        mapExternalStatusToCaseState(current.state, external.status, canonicalIssue.state),
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

    const caseIds = await findCaseIdsByProjectItem(projectItemId);
    if (caseIds.length === 0) return null;

    let firstUpdated: QontrolCase | null = null;
    for (const caseId of caseIds) {
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
        discussionSummary: current.external?.discussionSummary,
        discussionUpdatedAt: current.external?.discussionUpdatedAt,
      };

      const updated = await persistExternalSync({
        caseId,
        externalTicket: external,
        note: `GitHub board status changed to ${nextStatus}.`,
        actor: "team",
        nextState: mapExternalStatusToCaseState(current.state, nextStatus, "open"),
      });

      firstUpdated ??= updated;
    }

    return firstUpdated;
  }

  return null;
}

