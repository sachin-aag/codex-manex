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
  highlight?: boolean;
};

export type StoryVisualization =
  | {
      kind: "supplier";
      title: string;
      summary: string;
      steps: FlowStep[];
      annotations: string[];
    }
  | {
      kind: "process";
      title: string;
      summary: string;
      section: string;
      trend: ProcessTrendPoint[];
      annotations: string[];
    }
  | {
      kind: "design";
      title: string;
      summary: string;
      assembly: string;
      findNumber: string;
      lagDistribution: DistributionPoint[];
      annotations: string[];
    }
  | {
      kind: "handling";
      title: string;
      summary: string;
      operator: string;
      steps: FlowStep[];
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
  emailDraft: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
  };
  escalationEmailDraft: {
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
