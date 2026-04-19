import OpenAI from "openai";
import { NextResponse } from "next/server";

import {
  buildInsightsContext,
  type InsightsContext,
} from "@/lib/portfolio-insights/context";
import {
  DEFAULT_INSIGHTS_MODEL,
  INSIGHTS_SYSTEM_PROMPT,
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

const CHAT_SYSTEM_SUFFIX = `You are now in chat mode with a quality manager on the Portfolio Insights page. They can see the same context you see. Respond in natural, concise English (plain text, not JSON). Cite specific IDs from the context when relevant (e.g. INI-00002, SB-00007, PM-00008, ART-00001, section names).

If the user gives you new information that makes one of your recommendations less attractive, say so explicitly ("you're right, given X, the PM-00008 revert is now lower-priority because Y"). If they push back without adding new facts, hold your ground with the data.

If you do not have the answer in the context, say so rather than inventing.`;

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
  try {
    context = await getContext();
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
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: getModel(),
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        { role: "system", content: CHAT_SYSTEM_SUFFIX },
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
    return NextResponse.json({
      message: { role: "assistant", content },
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
