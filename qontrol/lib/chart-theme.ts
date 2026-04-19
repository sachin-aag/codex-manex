export const CHART_SERIES = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
] as const;

export const CHART_COLORS = {
  volumeBar: "var(--chart-volume-bar)",
  barPrimary: "var(--chart-bar-primary)",
  barSecondary: "var(--chart-bar-secondary)",
  referenceLine: "var(--chart-reference-line)",
  defectLine: "var(--chart-series-3)",
  claimLine: "var(--chart-series-1)",
  cumulativeLine: "var(--chart-series-2)",
  pointFill: "var(--surface)",
} as const;

export const DONUT_BUCKET_COLORS = [
  "var(--chart-series-4)",
  "var(--chart-series-2)",
  "var(--chart-series-1)",
  "var(--chart-series-3)",
] as const;

export const SEVERITY_COLORS = {
  low: "var(--chart-severity-low)",
  medium: "var(--chart-severity-medium)",
  high: "var(--chart-severity-high)",
  critical: "var(--chart-severity-critical)",
  other: "var(--chart-severity-other)",
} as const;
