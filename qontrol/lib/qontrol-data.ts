export type StoryKey =
  | "supplier"
  | "process"
  | "design"
  | "handling";

export type Clarity = "match" | "needs clarification" | "warning";

export type Severity = "high" | "medium" | "low";

export type SourceType = "claim" | "defect";

export type ResponsibleTeam = "RD" | "MO" | "SC";

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
  fixedBy: string;
  actionTaken: string;
  timeToFix: string;
  resolutionDays: number | null;
  outcome: "worked" | "open";
  learning: string;
};

export type EmailDraft = {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
};

export type ProposedFix = {
  containment: string;
  permanentFix: string;
  validation: string;
  confidence: "low" | "medium" | "high";
  basis: string[];
  ownerConfirmation: "pending" | "accepted" | "revised";
};

export type TriageContext = {
  matchingCases: number;
  openMatchingCases: number;
  queuePriority: string;
  timeSignal: string;
  nextMove: string;
};

export type FlowStep = {
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
};

export type ProcessTrendPoint = {
  label: string;
  count: number;
  highlight?: boolean;
};

export type DistributionPoint = {
  label: string;
  count: number;
  detail?: string;
  highlight?: boolean;
};

export type StorySignalPoint = {
  label: string;
  defectCount: number;
  failCount: number;
  marginalCount: number;
  highlight?: boolean;
};

export type StoryHeatmapCell = {
  detected: string;
  occurred: string;
  count: number;
};

export type StorySectionHeatmap = {
  cells: StoryHeatmapCell[];
  detectedOrder: string[];
  occurrenceOrder: string[];
  maxCount: number;
};

export type StoryScatterPoint = {
  id: string;
  x: number;
  y: number;
  articleName: string;
  market: string | null;
  cost: number | null;
  claimTs: string;
  complaintExcerpt: string;
};

export type StoryMatrixCell = {
  order: string;
  operator: string;
  count: number;
  defectTypes: string[];
  highlight?: boolean;
};

export type StoryVisualization =
  | {
      kind: "supplier";
      title: string;
      summary: string;
      steps: FlowStep[];
      batchId: string;
      supplierName: string;
      receivedDate: string | null;
      exposedProducts: number;
      affectedProducts: number;
      defectRate: number;
      lagDistribution: DistributionPoint[];
      testOutcomes: DistributionPoint[];
      annotations: string[];
    }
  | {
      kind: "process";
      title: string;
      summary: string;
      section: string;
      trend: StorySignalPoint[];
      heatmap: StorySectionHeatmap;
      filteredFalsePositives: number;
      annotations: string[];
    }
  | {
      kind: "design";
      title: string;
      summary: string;
      assembly: string;
      findNumber: string;
      lagDistribution: DistributionPoint[];
      claimScatter: StoryScatterPoint[];
      fieldOnlyClaims: number;
      overlappingClaims: number;
      annotations: string[];
    }
  | {
      kind: "handling";
      title: string;
      summary: string;
      operator: string;
      orderMatrix: {
        orders: string[];
        operators: string[];
        cells: StoryMatrixCell[];
        maxCount: number;
      };
      severityMix: DistributionPoint[];
      actionSnapshot: {
        openActions: number;
        closedActions: number;
        latestAction: string;
      };
      annotations: string[];
    };

export type TeamTicket = {
  system: "GitHub" | "Service Cloud" | "QMS";
  ticketId: string;
  urlLabel: string;
  url?: string;
  status: string;
  assignee: string;
  lastUpdate: string;
  sync: "synced" | "awaiting push" | "attention needed";
  repo?: string;
  issueNumber?: number;
  projectItemId?: number;
  projectUrl?: string;
  lastSyncNote?: string;
  discussionSummary?: string;
  discussionUpdatedAt?: string;
};

export type QontrolCase = {
  id: string;
  title: string;
  sourceType: SourceType;
  state: CaseState;
  story: StoryKey;
  defectType: string;
  similarityKey: string | null;
  responsibleTeam: ResponsibleTeam;
  clarity: Clarity;
  severity: Severity;
  costUsd: number;
  market: string;
  productId: string;
  articleId: string;
  partNumber: string;
  imageUrl: string | null;
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
  triageContext: TriageContext;
  visualization: StoryVisualization;
  proposedFix: ProposedFix;
  requestedAction: {
    containment: string;
    permanentFix: string;
    validation: string;
  };
  similarTickets: SimilarTicket[];
  learnings: string[];
  timeline: TimelineEvent[];
  emailDraft: EmailDraft;
  escalationEmailDraft: EmailDraft;
};

export const storyLabel: Record<StoryKey, string> = {
  supplier: "Supplier incident",
  process: "Process drift",
  design: "Design weakness",
  handling: "Operator / handling",
};

export const clarityLabel: Record<Clarity, string> = {
  match: "Error",
  "needs clarification": "Needs clarification",
  warning: "Warning",
};

export const sourceTypeLabel: Record<SourceType, string> = {
  defect: "Defect",
  claim: "Claim",
};

export const responsibleTeamLabel: Record<ResponsibleTeam, string> = {
  RD: "RD",
  MO: "MO",
  SC: "SC",
};
