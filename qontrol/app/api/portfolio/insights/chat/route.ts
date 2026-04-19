import OpenAI from "openai";
import { NextResponse } from "next/server";

import {
  buildInsightsContext,
  type InsightsContext,
} from "@/lib/portfolio-insights/context";
import type {
  InsightsChatAssistantPayload,
  InsightsChatEvidencePlot,
  InsightsChatEvidenceQuery,
  InsightsChatPlotDataPoint,
  InsightsChatPlotKind,
  InsightsChatPlotSeries,
  InsightsChatPlotTone,
} from "@/lib/portfolio-insights/chat-types";
import { getInsightsDocsContext } from "@/lib/portfolio-insights/docs-context";
import {
  DEFAULT_INSIGHTS_MODEL,
  INSIGHTS_CHAT_ANALYTICS_SKILL,
  INSIGHTS_CHAT_RESPONSE_FORMAT,
  INSIGHTS_CHAT_SYSTEM_PROMPT,
} from "@/lib/portfolio-insights/prompt";

export const runtime = "nodejs";

const MAX_MESSAGES = 30;
const MAX_CONTENT_CHARS_PER_MESSAGE = 6_000;
const CONTEXT_CACHE_TTL_MS = 60_000;
const MAX_CONTEXT_CHARS = 100_000;

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

let cachedContext: { at: number; context: InsightsContext } | null = null;

function getOpenAIKey(): string | null {
  const k = process.env.OPENAI_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_INSIGHTS_MODEL;
}

async function getContext(): Promise<InsightsContext> {
  if (cachedContext && Date.now() - cachedContext.at < CONTEXT_CACHE_TTL_MS) {
    return cachedContext.context;
  }
  const context = await buildInsightsContext(null);
  cachedContext = { at: Date.now(), context };
  return context;
}

function sanitizeMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const messages: ChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: string }).role;
    const content = (item as { content?: string }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    const trimmed = content.slice(0, MAX_CONTENT_CHARS_PER_MESSAGE);
    messages.push({ role, content: trimmed });
  }
  if (!messages.length) return null;
  if (messages[messages.length - 1].role !== "user") return null;
  return messages.slice(-MAX_MESSAGES);
}

const CHAT_SYSTEM_SUFFIX = `You are now in chat mode with a quality manager on the Portfolio Insights page. They can see the same context you see. Write the answer in natural, concise English, but wrap it in the required JSON schema. Cite specific IDs from the context when relevant (e.g. INI-00002, SB-00007, PM-00008, ART-00001, section names).

When the user says "tickets", interpret that as the overall quality backlog and live issue portfolio, not just one narrow entity type.

If the user gives you new information that makes one of your recommendations less attractive, say so explicitly ("you're right, given X, the PM-00008 revert is now lower-priority because Y"). If they push back without adding new facts, hold your ground with the data.

If you do not have the answer in the context, say so rather than inventing.`;

const PLOT_TONES = new Set<InsightsChatPlotTone>([
  "brand",
  "danger",
  "warning",
  "success",
  "muted",
]);

const PLOT_KINDS = new Set<InsightsChatPlotKind>(["bar", "line", "stacked-bar"]);

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function truncateLabel(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSeries(input: unknown): InsightsChatPlotSeries[] {
  if (!Array.isArray(input)) return [];
  const series: InsightsChatPlotSeries[] = [];
  for (const item of input) {
    if (!isRecord(item)) continue;
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const tone = typeof item.tone === "string" ? item.tone.trim() as InsightsChatPlotTone : "brand";
    if (!key || !label || !PLOT_TONES.has(tone)) continue;
    series.push({ key, label, tone });
  }
  return series;
}

function normalizeData(input: unknown): InsightsChatPlotDataPoint[] {
  if (!Array.isArray(input)) return [];
  const data: InsightsChatPlotDataPoint[] = [];
  for (const row of input) {
    if (!isRecord(row)) continue;
    const normalized: InsightsChatPlotDataPoint = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" || typeof value === "number") {
        normalized[key] = value;
      }
    }
    if (Object.keys(normalized).length > 0) data.push(normalized);
  }
  return data;
}

function normalizePlots(input: unknown): InsightsChatEvidencePlot[] {
  if (!Array.isArray(input)) return [];
  const plots: InsightsChatEvidencePlot[] = [];
  for (const item of input) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const why_it_matters =
      typeof item.why_it_matters === "string" ? item.why_it_matters.trim() : "";
    const kind =
      typeof item.kind === "string" ? item.kind.trim() as InsightsChatPlotKind : "bar";
    const x_key = typeof item.x_key === "string" ? item.x_key.trim() : "";
    const y_label = typeof item.y_label === "string" ? item.y_label.trim() : "";
    const series = normalizeSeries(item.series);
    const data = normalizeData(item.data);
    if (!id || !title || !why_it_matters || !x_key || !y_label) continue;
    if (!PLOT_KINDS.has(kind) || series.length === 0 || data.length === 0) continue;
    plots.push({ id, title, why_it_matters, kind, x_key, y_label, series, data });
  }
  return plots.slice(0, 3);
}

function normalizeQueries(input: unknown): InsightsChatEvidenceQuery[] {
  if (!Array.isArray(input)) return [];
  const queries: InsightsChatEvidenceQuery[] = [];
  for (const item of input) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const why_it_matters =
      typeof item.why_it_matters === "string" ? item.why_it_matters.trim() : "";
    const sql = typeof item.sql === "string" ? item.sql.trim() : "";
    if (!id || !title || !why_it_matters || !sql) continue;
    queries.push({ id, title, why_it_matters, sql });
  }
  return queries.slice(0, 2);
}

function parseAssistantPayload(raw: string): InsightsChatAssistantPayload | null {
  try {
    const parsed = JSON.parse(stripCodeFences(raw)) as unknown;
    if (!isRecord(parsed)) return null;
    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : "";
    if (!answer) return null;
    return {
      answer,
      plots: normalizePlots(parsed.plots),
      queries: normalizeQueries(parsed.queries),
    };
  } catch {
    return null;
  }
}

function buildCostPlot(question: string, context: InsightsContext): InsightsChatEvidencePlot {
  const isStatus = /\bstatus|overall|portfolio|backlog\b/i.test(question);
  const data = context.baselines.cost_ribbon.trajectory
    .slice(-8)
    .map((point) => ({
      week: point.week_start.slice(5),
      defects_cost: round(point.defects_cost, 0),
      claims_cost: round(point.claims_cost, 0),
      rework_cost: round(point.rework_cost, 0),
    }));

  return {
    id: "plot_cost_trajectory",
    title: isStatus ? "Recent weekly quality cost mix" : "Weekly cost impact around the rise",
    why_it_matters:
      "Shows whether the pressure is coming from internal defects, field claims, or rework burden across the latest weeks in context.",
    kind: "line",
    x_key: "week",
    y_label: "Cost (USD est.)",
    series: [
      { key: "defects_cost", label: "Defects", tone: "danger" },
      { key: "claims_cost", label: "Claims", tone: "warning" },
      { key: "rework_cost", label: "Rework", tone: "brand" },
    ],
    data,
  };
}

function buildDefectDriverPlot(context: InsightsContext): InsightsChatEvidencePlot {
  const data = context.baselines.defect_code_trends
    .slice(0, 6)
    .map((row) => ({
      defect_code: row.defect_code,
      recent_count: row.recent_count,
      prior_count: row.prior_count,
    }));

  return {
    id: "plot_defect_code_drivers",
    title: "Which defect codes moved the most",
    why_it_matters:
      "Compares the latest 4-week window with the previous 4 weeks so you can see whether one defect is driving the rise or several are moving together.",
    kind: "bar",
    x_key: "defect_code",
    y_label: "Defect count",
    series: [
      { key: "recent_count", label: "Latest 4 weeks", tone: "brand" },
      { key: "prior_count", label: "Prior 4 weeks", tone: "muted" },
    ],
    data,
  };
}

function buildMonthlyDefectMixPlot(context: InsightsContext): InsightsChatEvidencePlot {
  const recentMonths = context.baselines.monthly_defect_mix.slice(-3);
  const topCodes = Array.from(
    new Set(
      recentMonths.flatMap((month) =>
        month.top_codes.slice(0, 3).map((code) => code.defect_code),
      ),
    ),
  ).slice(0, 3);

  const data = recentMonths.map((month) => {
    const row: InsightsChatPlotDataPoint = { month: month.month_key.slice(5) };
    for (const defectCode of topCodes) {
      row[defectCode] =
        month.top_codes.find((code) => code.defect_code === defectCode)?.count ?? 0;
    }
    return row;
  });

  const tones: InsightsChatPlotTone[] = ["brand", "danger", "warning"];
  const series = topCodes.map((defectCode, index) => ({
    key: defectCode,
    label: defectCode,
    tone: tones[index] ?? "muted",
  }));

  return {
    id: "plot_monthly_defect_mix",
    title: "Monthly defect mix by top codes",
    why_it_matters:
      "Shows whether the rise is tied to one dominant defect family or reflects a broader shift across multiple codes.",
    kind: "stacked-bar",
    x_key: "month",
    y_label: "Defect count",
    series,
    data,
  };
}

function buildSectionPlot(context: InsightsContext): InsightsChatEvidencePlot {
  const data = context.baselines.section_counts
    .filter((row) => !row.is_detection_station)
    .sort((a, b) => b.count_4wk - a.count_4wk)
    .slice(0, 6)
    .map((row) => ({
      section: truncateLabel(row.section_name, 16),
      count_4wk: row.count_4wk,
      z_score: round(row.z_score, 1),
    }));

  return {
    id: "plot_section_counts",
    title: "Where recent issue volume is originating",
    why_it_matters:
      "Highlights the sections with the highest recent issue counts after excluding pure detection-bias stations.",
    kind: "bar",
    x_key: "section",
    y_label: "Issues in latest 4-week window",
    series: [{ key: "count_4wk", label: "4-week count", tone: "brand" }],
    data,
  };
}

function buildBatchPlot(context: InsightsContext): InsightsChatEvidencePlot {
  const data = context.baselines.batch_cohorts
    .sort((a, b) => b.batch_rate - a.batch_rate)
    .slice(0, 6)
    .map((row) => ({
      batch: row.batch_id,
      defect_rate_pct: round(row.batch_rate * 100, 1),
      peer_median_pct: round(row.supplier_peer_median_rate * 100, 1),
    }));

  return {
    id: "plot_batch_rates",
    title: "Highest-risk supplier batches",
    why_it_matters:
      "Compares each exposed batch's defective-product rate against the supplier peer median to surface outlier material risk.",
    kind: "bar",
    x_key: "batch",
    y_label: "Defect rate (%)",
    series: [
      { key: "defect_rate_pct", label: "Batch defect rate", tone: "danger" },
      { key: "peer_median_pct", label: "Supplier peer median", tone: "muted" },
    ],
    data,
  };
}

function buildOperatorPlot(context: InsightsContext): InsightsChatEvidencePlot {
  const data = context.baselines.operator_concentration
    .slice(0, 6)
    .map((row) => ({
      order: row.order_id,
      share_pct: round(row.share * 100, 1),
    }));

  return {
    id: "plot_operator_share",
    title: "Operator concentration on affected orders",
    why_it_matters:
      "Shows whether a small set of operators dominates the rework linked to affected production orders.",
    kind: "bar",
    x_key: "order",
    y_label: "Top-operator share (%)",
    series: [{ key: "share_pct", label: "Share of rework", tone: "warning" }],
    data,
  };
}

function buildFallbackPlots(
  question: string,
  context: InsightsContext,
): InsightsChatEvidencePlot[] {
  const lower = question.toLowerCase();
  const plots: InsightsChatEvidencePlot[] = [];

  if (/\bdec|december|rise|spike|increase|up\b/.test(lower)) {
    plots.push(buildMonthlyDefectMixPlot(context));
    plots.push(buildDefectDriverPlot(context));
    plots.push(buildCostPlot(question, context));
  } else if (/\bstatus|overall|portfolio|backlog\b/.test(lower)) {
    plots.push(buildCostPlot(question, context));
    plots.push(buildDefectDriverPlot(context));
    plots.push(buildBatchPlot(context));
  } else if (/\boperator|handling|order\b/.test(lower)) {
    plots.push(buildOperatorPlot(context));
    plots.push(buildSectionPlot(context));
    plots.push(buildCostPlot(question, context));
  } else if (/\bbatch|supplier|material\b/.test(lower)) {
    plots.push(buildBatchPlot(context));
    plots.push(buildDefectDriverPlot(context));
    plots.push(buildCostPlot(question, context));
  } else {
    plots.push(buildCostPlot(question, context));
    plots.push(buildDefectDriverPlot(context));
    plots.push(buildBatchPlot(context));
  }

  return plots.slice(0, 3);
}

function buildFallbackQueries(question: string): InsightsChatEvidenceQuery[] {
  const lower = question.toLowerCase();

  if (/\bdec|december|rise|spike|increase|up\b/.test(lower)) {
    return [
      {
        id: "query_december_defect_codes",
        title: "December weekly defect-code breakdown",
        why_it_matters:
          "Shows exactly which defect codes increased during December and whether one code dominated the movement.",
        sql: `SELECT
  date_trunc('week', defect_ts) AS week_start,
  defect_code,
  COUNT(*) AS defect_count
FROM v_defect_detail
WHERE defect_ts >= DATE '2025-12-01'
  AND defect_ts < DATE '2026-01-01'
GROUP BY 1, 2
ORDER BY 1, defect_count DESC, defect_code;`,
      },
      {
        id: "query_december_code_sections",
        title: "Origin sections for December's top defect codes",
        why_it_matters:
          "Separates a broad rise from a concentrated operational issue by showing where the main December defects were occurring.",
        sql: `SELECT
  defect_code,
  occurrence_section_name,
  COUNT(*) AS defect_count
FROM v_defect_detail
WHERE defect_ts >= DATE '2025-12-01'
  AND defect_ts < DATE '2026-01-01'
GROUP BY 1, 2
ORDER BY defect_count DESC, defect_code, occurrence_section_name;`,
      },
    ];
  }

  return [
    {
      id: "query_portfolio_weekly",
      title: "Weekly quality summary by article",
      why_it_matters:
        "Provides the portfolio-level trend view for issue load and lets you see which articles are driving the current picture.",
      sql: `SELECT
  week_start,
  article_id,
  article_name,
  defect_count,
  claim_count,
  products_built
FROM v_quality_summary
ORDER BY week_start DESC, defect_count DESC;`,
    },
    {
      id: "query_actions_status",
      title: "Current action status mix",
      why_it_matters:
        "Shows whether follow-up work is still open, stale, or already closed in the product action log.",
      sql: `SELECT
  action_type,
  status,
  COUNT(*) AS actions
FROM product_action
GROUP BY 1, 2
ORDER BY actions DESC, action_type, status;`,
    },
  ];
}

function enrichAnswer(
  question: string,
  context: InsightsContext,
  answer: string,
): string {
  const trimmed = answer.trim();
  if (!trimmed) return trimmed;

  const knownCodes = context.baselines.defect_code_trends.map((row) => row.defect_code);
  const mentionsKnownCode = knownCodes.some((code) => trimmed.includes(code));
  const lower = question.toLowerCase();

  if (/\bdec|december|rise|spike|increase|up\b/.test(lower) && !mentionsKnownCode) {
    const decemberMix =
      context.baselines.monthly_defect_mix.find((month) => month.month_key.endsWith("-12")) ??
      context.baselines.monthly_defect_mix[context.baselines.monthly_defect_mix.length - 1];

    if (decemberMix?.top_codes?.length) {
      const drivers = decemberMix.top_codes
        .slice(0, 2)
        .map((code) => `${code.defect_code} (${code.count})`)
        .join(" and ");
      return `${trimmed}${trimmed.endsWith(".") ? "" : "."} In the month-level defect mix, the biggest December drivers are ${drivers}, so the rise is not just a generic increase in overall workload.`;
    }
  }

  if (/\bstatus|overall|portfolio|backlog\b/.test(lower) && !mentionsKnownCode) {
    const topDriver = context.baselines.defect_code_trends[0];
    if (topDriver) {
      return `${trimmed}${trimmed.endsWith(".") ? "" : "."} The strongest current driver in the latest comparison window is ${topDriver.defect_code}, which moved from ${topDriver.prior_count} to ${topDriver.recent_count} cases.`;
    }
  }

  return trimmed;
}

function ensureArtifacts(
  question: string,
  context: InsightsContext,
  parsed: InsightsChatAssistantPayload | null,
  rawAnswer: string,
): InsightsChatAssistantPayload {
  const fallbackPlots = buildFallbackPlots(question, context);
  const fallbackQueries = buildFallbackQueries(question);

  return {
    answer: enrichAnswer(
      question,
      context,
      parsed?.answer?.trim() || rawAnswer.trim(),
    ),
    plots: parsed?.plots?.length
      ? [...parsed.plots, ...fallbackPlots].slice(0, Math.max(2, parsed.plots.length))
      : fallbackPlots,
    queries: parsed?.queries?.length
      ? [...parsed.queries, ...fallbackQueries].slice(0, Math.max(1, parsed.queries.length))
      : fallbackQueries,
  };
}

export async function POST(request: Request) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY is not configured",
        details: "Set OPENAI_API_KEY in .env.local to enable the chat agent.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const messages = sanitizeMessages(body.messages);
  if (!messages) {
    return NextResponse.json(
      { error: "`messages` must be a non-empty array ending with a user message." },
      { status: 400 },
    );
  }

  let context: InsightsContext;
  let docsContext: string;
  try {
    [context, docsContext] = await Promise.all([
      getContext(),
      getInsightsDocsContext(),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build context";
    return NextResponse.json(
      { error: "PostgREST data fetch failed", details: msg },
      { status: 503 },
    );
  }

  let contextJson = JSON.stringify(context, null, 2);
  if (contextJson.length > MAX_CONTEXT_CHARS) {
    contextJson = contextJson.slice(0, MAX_CONTEXT_CHARS) + "\n...[truncated]";
  }

  try {
    const latestQuestion = messages[messages.length - 1]?.content ?? "";
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: getModel(),
      max_completion_tokens: 1600,
      messages: [
        { role: "system", content: INSIGHTS_CHAT_SYSTEM_PROMPT },
        { role: "system", content: INSIGHTS_CHAT_ANALYTICS_SKILL },
        { role: "system", content: INSIGHTS_CHAT_RESPONSE_FORMAT },
        { role: "system", content: CHAT_SYSTEM_SUFFIX },
        { role: "system", content: docsContext },
        {
          role: "system",
          content: `Portfolio Insights context (JSON):\n${contextJson}`,
        },
        ...messages,
      ],
    });
    const content = response.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json(
        { error: "Empty model response" },
        { status: 502 },
      );
    }
    const parsed = parseAssistantPayload(content);
    const payload = ensureArtifacts(latestQuestion, context, parsed, content);
    return NextResponse.json({
      message: { role: "assistant", content: payload.answer, payload },
      model: getModel(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    return NextResponse.json(
      { error: "LLM request failed", details: msg },
      { status: 502 },
    );
  }
}
