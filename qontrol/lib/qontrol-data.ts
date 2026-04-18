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
  sync: "synced" | "awaiting push" | "attention needed";
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
