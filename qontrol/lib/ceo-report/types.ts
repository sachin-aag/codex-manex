import type { ResponsibleTeam } from "@/lib/qontrol-data";

export type CeoReportStatusSnapshot = {
  code: string;
  label: string;
};

export type CeoReportTicketRow = {
  id: string;
  title: string;
  team: ResponsibleTeam;
  assignee: string;
  ownerTeam: string;
  statusLastWeek: CeoReportStatusSnapshot;
  statusThisWeek: CeoReportStatusSnapshot;
  overdue: boolean;
  lastUpdateAt: string;
  sourceType: "defect" | "claim";
};

export type CeoReportTeamPortfolioRow = {
  team: ResponsibleTeam;
  high: number;
  medium: number;
  low: number;
  overdue: number;
  total: number;
};

export type CeoReportLaggingTeam = {
  isFlagged: boolean;
  team: ResponsibleTeam | null;
  headline: string;
  reason: string;
  score: number;
};

export type CeoReportTrendPoint = {
  weekStart: string;
  label: string;
  incidents: number;
  defects: number;
  claims: number;
};

export type CeoReportNarrativeCard = {
  title: string;
  body: string;
  metricLabel: string;
  metricValue: string;
  tone: "positive" | "watch" | "neutral";
};

export type CeoReportSummary = {
  openTickets: number;
  highSeverityOpen: number;
  overdueOpen: number;
  reportWeekLabel: string;
  comparisonLastWeekLabel: string;
  comparisonThisWeekLabel: string;
};

export type CeoReportData = {
  reportId: string;
  generatedAt: string;
  nextGenerationAt: string;
  title: string;
  subtitle: string;
  reportWeekStart: string;
  reportWeekEnd: string;
  summary: CeoReportSummary;
  highSeverityTickets: CeoReportTicketRow[];
  teamPortfolio: CeoReportTeamPortfolioRow[];
  laggingTeam: CeoReportLaggingTeam;
  trendSeries: CeoReportTrendPoint[];
  narrativeCards: CeoReportNarrativeCard[];
};

export type CeoReportSlideArtifact = {
  title: string;
  imageUrl: string;
};

export type CeoReportArtifactMetadata = {
  reportId: string;
  generatedAt: string;
  nextGenerationAt: string;
  title: string;
  subtitle: string;
  downloadUrl: string;
  slides: CeoReportSlideArtifact[];
  summary: CeoReportSummary;
  laggingTeam: CeoReportLaggingTeam;
  highSeverityTicketCount: number;
  narrativeCards: CeoReportNarrativeCard[];
};
