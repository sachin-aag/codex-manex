import OpenAI from "openai";
import { NextResponse } from "next/server";

import { buildBriefingContext } from "@/lib/quality-briefing/context";
import { parseBriefingPayload } from "@/lib/quality-briefing/briefing-types";
import {
  BRIEFING_SYSTEM_PROMPT,
  DEFAULT_BRIEFING_MODEL,
} from "@/lib/quality-briefing/prompt";

export const runtime = "nodejs";

const MAX_CONTEXT_CHARS = 120_000;

function getOpenAIKey(): string | null {
  const k = process.env.OPENAI_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_BRIEFING_MODEL;
}

export async function POST() {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY is not configured",
        details: "Set OPENAI_API_KEY in .env.local",
      },
      { status: 503 },
    );
  }

  let context: Awaited<ReturnType<typeof buildBriefingContext>>;
  try {
    context = await buildBriefingContext();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load quality data";
    return NextResponse.json(
      { error: "PostgREST data fetch failed", details: msg },
      { status: 503 },
    );
  }

  let userPayload = JSON.stringify(
    {
      context,
      instructions:
        "Generate the briefing JSON. The context includes priority_defects, defects_without_actions, stale_open_actions (no due dates in DB), recurring patterns, inspection_failures, rework_by_week, pareto_top_codes, data_patterns_hint, and stats.",
    },
    null,
    2,
  );
  if (userPayload.length > MAX_CONTEXT_CHARS) {
    userPayload = userPayload.slice(0, MAX_CONTEXT_CHARS) + "\n…[truncated]";
  }

  const generatedAt = new Date().toISOString();

  try {
    const client = new OpenAI({ apiKey });
    const model = getModel();
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: BRIEFING_SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";

    if (!raw) {
      return NextResponse.json(
        { error: "Empty model response", generatedAt },
        { status: 502 },
      );
    }

    let briefing;
    try {
      briefing = parseBriefingPayload(raw);
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error ? parseErr.message : "JSON parse failed";
      return NextResponse.json(
        {
          error: "Invalid briefing JSON from model",
          details: msg,
          raw,
          generatedAt,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      briefing,
      generatedAt,
      model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    return NextResponse.json(
      { error: "LLM request failed", details: msg, generatedAt },
      { status: 502 },
    );
  }
}
