import {
  type CaseState,
  type Clarity,
  type QontrolCase,
  type Severity,
  type StoryKey,
  type TimelineEvent,
} from "@/lib/qontrol-data";
import { postgrestRequest } from "@/lib/db/postgrest";

type DefectRow = {
  defect_id: string;
  product_id: string;
  defect_ts: string | null;
  source_type: string | null;
  defect_code: string | null;
  severity: string | null;
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
  updated_at: string;
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
      source: entry.actor === "system" ? "system" : "qm",
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
    ],
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
    ],
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
  const severityOverride = extractSeverityOverride(state.state_history);
  return {
    ...base,
    state: state.current_state,
    assignee: state.assignee ?? base.assignee,
    ownerTeam: state.owner_team ?? base.ownerTeam,
    qmOwner: state.qm_owner ?? base.qmOwner,
    severity: severityOverride ?? base.severity,
    lastUpdateAt: state.updated_at ?? base.lastUpdateAt,
    timeline: historyToTimeline(state.state_history),
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
          "defect_id,product_id,defect_ts,source_type,defect_code,severity,reported_part_number,image_url,cost,notes,article_id,article_name",
        order: "defect_ts.desc",
        limit: "120",
      },
    }),
    postgrestRequest<ClaimRow[]>("v_field_claim_detail", {
      method: "GET",
      query: {
        select:
          "field_claim_id,product_id,claim_ts,market,complaint_text,reported_part_number,cost,mapped_defect_id,mapped_defect_code,mapped_defect_severity,notes,article_id,article_name",
        order: "claim_ts.desc",
        limit: "120",
      },
    }),
    fetchOptionalStates(),
  ]);

  const stateByCaseId = new Map(states.map((item) => [item.case_id, item]));

  const merged = [
    ...defects.map((row) => applyState(buildBaseCaseFromDefect(row), stateByCaseId.get(row.defect_id))),
    ...claims.map((row) =>
      applyState(buildBaseCaseFromClaim(row), stateByCaseId.get(row.field_claim_id)),
    ),
  ];

  return merged.sort(
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
  });

  return getCaseById(caseId);
}

