export type InsightsChatPlotTone =
  | "brand"
  | "danger"
  | "warning"
  | "success"
  | "muted";

export type InsightsChatPlotKind = "bar" | "line" | "stacked-bar";

export type InsightsChatPlotSeries = {
  key: string;
  label: string;
  tone: InsightsChatPlotTone;
};

export type InsightsChatPlotDataPoint = Record<string, string | number>;

export type InsightsChatEvidencePlot = {
  id: string;
  title: string;
  why_it_matters: string;
  kind: InsightsChatPlotKind;
  x_key: string;
  y_label: string;
  series: InsightsChatPlotSeries[];
  data: InsightsChatPlotDataPoint[];
};

export type InsightsChatEvidenceQuery = {
  id: string;
  title: string;
  why_it_matters: string;
  sql: string;
};

export type InsightsChatAssistantPayload = {
  answer: string;
  plots: InsightsChatEvidencePlot[];
  queries: InsightsChatEvidenceQuery[];
};
