export type StoryKey =
  | "supplier"
  | "process"
  | "design"
  | "handling";

export type Clarity = "match" | "needs clarification" | "warning";

export type Severity = "high" | "medium" | "low";

export type CaseState =
  | "unassigned"
  | "assigned"
  | "returned_to_qm_for_verification"
  | "closed";

export type FollowUpMode = "email" | "call" | "escalate";

export type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  description: string;
  source: "qm" | "team" | "system" | "cs";
};

export type SimilarTicket = {
  id: string;
  title: string;
  story: StoryKey;
  team: string;
  actionTaken: string;
  timeToFix: string;
  outcome: "worked" | "partial" | "reopened";
  learning: string;
};

export type TeamTicket = {
  system: "Jira" | "Service Cloud" | "QMS";
  ticketId: string;
  urlLabel: string;
  status: string;
  assignee: string;
  lastUpdate: string;
  sync: "mock synced" | "awaiting push" | "attention needed";
};

export type QontrolCase = {
  id: string;
  title: string;
  sourceType: "claim" | "defect";
  state: CaseState;
  story: StoryKey;
  clarity: Clarity;
  severity: Severity;
  costUsd: number;
  market: string;
  productId: string;
  articleId: string;
  partNumber: string;
  ownerTeam: string;
  assignee: string;
  qmOwner: string;
  csOwner?: string;
  lastUpdateAt: string;
  nextFollowUpAt: string;
  external?: TeamTicket;
  summary: string;
  routingWhy: string[];
  missingEvidence: string[];
  evidenceTrail: string[];
  requestedAction: {
    containment: string;
    permanentFix: string;
    validation: string;
  };
  similarTickets: SimilarTicket[];
  learnings: string[];
  timeline: TimelineEvent[];
  emailDraft: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
  };
};

export const storyLabel: Record<StoryKey, string> = {
  supplier: "Supplier incident",
  process: "Process drift",
  design: "Design weakness",
  handling: "Operator / handling",
};

export const clarityLabel: Record<Clarity, string> = {
  match: "Match",
  "needs clarification": "Needs clarification",
  warning: "Warning",
};

export const mockCases: QontrolCase[] = [
  {
    id: "QM-1204",
    title: "MC-200 claims tied to capacitor cohort",
    sourceType: "claim",
    state: "unassigned",
    story: "supplier",
    clarity: "match",
    severity: "high",
    costUsd: 18240,
    market: "DE",
    productId: "PRD-00042",
    articleId: "ART-00001",
    partNumber: "PM-00008",
    ownerTeam: "Supply Chain",
    assignee: "Unassigned",
    qmOwner: "Nina Becker",
    csOwner: "Lea Winter",
    lastUpdateAt: "2026-04-17T08:30:00Z",
    nextFollowUpAt: "2026-04-20T09:00:00Z",
    summary:
      "Field claims and in-factory defects suggest a material-quality issue around the installed capacitor cohort. Complaint patterns mention early total failure after a short time in the field.",
    routingWhy: [
      "Defect pattern clusters around SOLDER_COLD on PM-00008.",
      "Claims align with the short 4-8 week lag described for the supplier story.",
      "This is best handled through supplier containment and incoming quality controls.",
    ],
    missingEvidence: [
      "Final confirmation of the affected installed population list.",
    ],
    evidenceTrail: [
      "Repeated SOLDER_COLD defects on the same reported part.",
      "Claim timing matches the short post-build lag for supplier-related escapes.",
      "ESR test behavior trends marginal/fail in the affected cohort.",
    ],
    requestedAction: {
      containment:
        "Quarantine the suspect cohort and review open WIP / stock exposure.",
      permanentFix:
        "Open supplier corrective action, tighten incoming screening, and define replacement path for affected units.",
      validation:
        "Provide confirmed affected-population list, containment evidence, and retest outcome summary back to QM.",
    },
    external: {
      system: "Jira",
      ticketId: "SC-214",
      urlLabel: "Open mock Jira ticket",
      status: "Draft - not created",
      assignee: "Unassigned",
      lastUpdate: "Not synced yet",
      sync: "awaiting push",
    },
    similarTickets: [
      {
        id: "QM-1098",
        title: "Capacitor lot issue on export units",
        story: "supplier",
        team: "Supply Chain",
        actionTaken: "Quarantine + supplier 8D",
        timeToFix: "11 days",
        outcome: "worked",
        learning:
          "Containment was fastest when affected installed population was identified before supplier response.",
      },
      {
        id: "QM-1071",
        title: "Incoming ESR drift on PM-00008",
        story: "supplier",
        team: "Supply Chain",
        actionTaken: "Incoming sampling tightened",
        timeToFix: "6 days",
        outcome: "partial",
        learning:
          "Screening alone reduced escapes but did not solve root cause without supplier follow-up.",
      },
    ],
    learnings: [
      "Material-quality issues need product-level cohort traceability before team handoff.",
    ],
    timeline: [
      {
        id: "tl-1",
        at: "2026-04-17T08:30:00Z",
        title: "Claim opened in QM",
        description: "CS escalated a recurring field-failure pattern for review.",
        source: "cs",
      },
      {
        id: "tl-2",
        at: "2026-04-17T09:10:00Z",
        title: "Story matched",
        description: "System classified case as supplier incident.",
        source: "system",
      },
    ],
    emailDraft: {
      to: ["supply-chain@manex.internal"],
      cc: ["qm@manex.internal", "cs@manex.internal"],
      subject: "QM-1204: review requested on likely supplier-driven capacitor issue",
      body:
        "Hi team,\n\nQM is routing QM-1204 to Supply Chain because the current evidence points to a likely supplier-driven issue on PM-00008. We are seeing repeated claims after a short time in field, alongside a SOLDER_COLD pattern in factory data.\n\nWhat we need from you:\n- confirm whether SC agrees with the current hypothesis\n- share containment action and affected-population assessment\n- provide an initial update by Apr 20\n- return evidence in the QM case once ready for verification\n\nQM expects an acknowledgement within 2 days and updates every 2 days until the case is ready for verification.\n\nThanks,\nNina\nQuality Management",
    },
  },
  {
    id: "QM-1186",
    title: "Vibration failures on Montage Linie 1",
    sourceType: "defect",
    state: "assigned",
    story: "process",
    clarity: "match",
    severity: "medium",
    costUsd: 6400,
    market: "DE",
    productId: "PRD-00114",
    articleId: "ART-00003",
    partNumber: "PM-00011",
    ownerTeam: "Manufacturing / Process",
    assignee: "Tobias Kern",
    qmOwner: "Nina Becker",
    lastUpdateAt: "2026-04-14T14:20:00Z",
    nextFollowUpAt: "2026-04-18T09:00:00Z",
    summary:
      "The December vibration failures line up with a contained line-specific process drift and associated torque rework notes.",
    routingWhy: [
      "VIB_FAIL aligns to the known Montage Linie 1 calibration story.",
      "Rework notes point to torque correction rather than supplier or design causes.",
      "This should be treated as a process-control correction with evidence returned to QM.",
    ],
    missingEvidence: ["Confirmation of recalibration and audit completion."],
    evidenceTrail: [
      "Time window concentrated in weeks 49-52/2025.",
      "Occurrence section is Montage Linie 1.",
      "Rework suggests screw torque correction.",
    ],
    requestedAction: {
      containment: "Confirm any residual stock/build-window risk and isolate if needed.",
      permanentFix:
        "Recalibrate the tool, audit recent runs, and update drift-prevention controls.",
      validation:
        "Return recalibration proof, audit evidence, and retest summary to QM.",
    },
    external: {
      system: "Jira",
      ticketId: "MO-88",
      urlLabel: "Open mock Jira ticket",
      status: "In Progress",
      assignee: "Tobias Kern",
      lastUpdate: "Apr 14, 14:20",
      sync: "mock synced",
    },
    similarTickets: [
      {
        id: "QM-0962",
        title: "Torque drift causing line-localized vibration failures",
        story: "process",
        team: "Manufacturing / Process",
        actionTaken: "Tool recalibration + audit",
        timeToFix: "4 days",
        outcome: "worked",
        learning: "The fastest path was to verify occurrence section, not detected section.",
      },
    ],
    learnings: [
      "Detected section must not be mistaken for root cause in end-of-line gates.",
    ],
    timeline: [
      {
        id: "tl-3",
        at: "2026-04-13T10:00:00Z",
        title: "QM routed to MO / P-M",
        description: "Approved as a process drift case and sent to Manufacturing / Process.",
        source: "qm",
      },
      {
        id: "tl-4",
        at: "2026-04-14T14:20:00Z",
        title: "Mock Jira update synced",
        description: "Assignee confirmed recalibration work is in progress.",
        source: "team",
      },
    ],
    emailDraft: {
      to: ["manufacturing-process@manex.internal"],
      cc: ["qm@manex.internal"],
      subject: "QM-1186: process review requested on likely calibration drift",
      body:
        "Hi team,\n\nQM is routing QM-1186 to Manufacturing / Process because the evidence points to a likely calibration issue on Montage Linie 1. We are seeing a contained VIB_FAIL pattern and associated torque-correction rework notes.\n\nWhat we need from you:\n- confirm process ownership\n- share recalibration and audit plan\n- provide the next update by Apr 18\n- return validation evidence once ready for QM verification\n\nThanks,\nNina\nQuality Management",
    },
  },
  {
    id: "QM-1211",
    title: "Thermal drift claims on MC-200 controller",
    sourceType: "claim",
    state: "returned_to_qm_for_verification",
    story: "design",
    clarity: "match",
    severity: "high",
    costUsd: 23100,
    market: "FR",
    productId: "PRD-00308",
    articleId: "ART-00001",
    partNumber: "PM-00015",
    ownerTeam: "R&D",
    assignee: "Sofia Lange",
    qmOwner: "Nina Becker",
    csOwner: "Lea Winter",
    lastUpdateAt: "2026-04-18T07:45:00Z",
    nextFollowUpAt: "2026-04-20T09:00:00Z",
    summary:
      "Long-lag field claims on ART-00001 line up with the latent design weakness story around PM-00015 / R33 and show no matching in-factory defect history.",
    routingWhy: [
      "The field-only failure pattern points to a design escape, not a line issue.",
      "Claim lag matches the 8-12 week window for the design story.",
      "The requested action is engineering review plus validation, with QM now waiting to test.",
    ],
    missingEvidence: ["QM verification of the proposed validation package."],
    evidenceTrail: [
      "No matching defect row for the affected products.",
      "Repeated claim theme around drift and temperature exposure.",
      "Part and article mapping aligns with the documented latent defect story.",
    ],
    requestedAction: {
      containment:
        "Keep CS informed on any customer-facing workaround or replacement path.",
      permanentFix:
        "Validate the proposed design change for PM-00015 / R33 and confirm rollout timing.",
      validation:
        "QM needs engineering validation results and proof that the revised test plan catches the issue.",
    },
    external: {
      system: "Jira",
      ticketId: "RD-301",
      urlLabel: "Open mock Jira ticket",
      status: "Ready for QM verification",
      assignee: "Sofia Lange",
      lastUpdate: "Apr 18, 07:45",
      sync: "mock synced",
    },
    similarTickets: [
      {
        id: "QM-1159",
        title: "Field-only resistor drift on control board",
        story: "design",
        team: "R&D",
        actionTaken: "Component uprating + test update",
        timeToFix: "16 days",
        outcome: "worked",
        learning:
          "Engineering validation must include long-duration thermal stress, not just nominal bench tests.",
      },
    ],
    learnings: [
      "Latent design defects should show the absence of factory history as evidence, not as a data gap.",
    ],
    timeline: [
      {
        id: "tl-5",
        at: "2026-04-12T09:30:00Z",
        title: "Claim routed to R&D",
        description: "QM approved the design-weakness recommendation.",
        source: "qm",
      },
      {
        id: "tl-6",
        at: "2026-04-18T07:45:00Z",
        title: "Ready for QM verification",
        description: "Mock Jira update indicates validation package is ready for review.",
        source: "team",
      },
    ],
    emailDraft: {
      to: ["rd-reliability@manex.internal"],
      cc: ["qm@manex.internal", "cs@manex.internal"],
      subject: "QM-1211: RD review requested on likely thermal drift issue",
      body:
        "Hi team,\n\nQM is routing QM-1211 to RD because the current evidence points to a likely design-related issue on ART-00001 / PM-00015. We are seeing repeated field claims after a long time-in-field pattern, with no matching factory defect signature.\n\nWhat we need from you:\n- confirm whether RD agrees with the hypothesis\n- provide the proposed corrective action and validation plan\n- share an initial update by Apr 15\n- return the validation package when ready for QM verification\n\nThanks,\nNina\nQuality Management",
    },
  },
  {
    id: "QM-1222",
    title: "Cosmetic scratch cluster on packaging orders",
    sourceType: "defect",
    state: "unassigned",
    story: "handling",
    clarity: "warning",
    severity: "low",
    costUsd: 950,
    market: "US",
    productId: "PRD-00412",
    articleId: "ART-00006",
    partNumber: "PM-00021",
    ownerTeam: "Manufacturing / Process",
    assignee: "Unassigned",
    qmOwner: "Nina Becker",
    lastUpdateAt: "2026-04-16T11:10:00Z",
    nextFollowUpAt: "2026-04-23T09:00:00Z",
    summary:
      "Low-severity cosmetic defects suggest a handling issue, but the current pattern is better treated as a warning until the order/operator clustering is confirmed.",
    routingWhy: [
      "The defect types align with the handling story but impact remains cosmetic-only.",
      "This is worth monitoring before routing if the cluster remains limited.",
      "QM can escalate if repeated order/operator evidence strengthens the match.",
    ],
    missingEvidence: [
      "Clear order-level clustering and stronger operator/rework linkage.",
    ],
    evidenceTrail: [
      "Issues are cosmetic and low severity.",
      "No functional impact confirmed.",
      "Pattern may be related to packaging-step handling.",
    ],
    requestedAction: {
      containment: "Monitor additional defects and capture packaging context.",
      permanentFix:
        "If the cluster strengthens, route to Manufacturing / Process for SOP and training review.",
      validation:
        "No formal validation yet; convert to routed case only if the pattern grows.",
    },
    similarTickets: [
      {
        id: "QM-1114",
        title: "Label misalignment warning before packaging retraining",
        story: "handling",
        team: "Manufacturing / Process",
        actionTaken: "Held as warning, later routed after repeat pattern",
        timeToFix: "9 days",
        outcome: "worked",
        learning:
          "Warnings became actionable once order-level clustering was explicit.",
      },
    ],
    learnings: [
      "Not every cosmetic issue should create a routed case immediately.",
    ],
    timeline: [
      {
        id: "tl-7",
        at: "2026-04-16T11:10:00Z",
        title: "Warning created",
        description: "QM flagged the pattern for monitoring instead of immediate routing.",
        source: "qm",
      },
    ],
    emailDraft: {
      to: ["manufacturing-process@manex.internal"],
      cc: ["qm@manex.internal"],
      subject: "QM-1222: heads-up on possible packaging-handling pattern",
      body:
        "Hi team,\n\nQM is tracking QM-1222 as a warning for a possible packaging-handling issue. At the moment the impact is cosmetic and low severity, so this is not yet a formal routed case.\n\nWhat we need from you:\n- keep an eye on additional occurrences in the same packaging area\n- share any packaging-step observations if the pattern grows\n- no formal corrective action is requested yet\n\nThanks,\nNina\nQuality Management",
    },
  },
];
