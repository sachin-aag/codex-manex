import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { postgrestRequest } from "@/lib/db/postgrest";
import type { Recommendation } from "@/lib/portfolio-insights/types";

export const runtime = "nodejs";

const DECK_ROOT_REL = path.join("public", "reports", "initiative-decks");

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function kvTable(obj: Record<string, unknown> | null | undefined): string {
  const entries = Object.entries(obj ?? {});
  if (!entries.length) return "<p class='muted'>-</p>";
  const rows = entries
    .map(
      ([k, v]) =>
        `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(
          typeof v === "object" ? JSON.stringify(v) : (v as string | number),
        )}</td></tr>`,
    )
    .join("");
  return `<table class="kv">${rows}</table>`;
}

function renderDeckHtml(args: {
  initiativeId: string | null;
  recommendation: Recommendation;
  generatedAt: string;
}): string {
  const { initiativeId, recommendation: rec, generatedAt } = args;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(rec.title)}${initiativeId ? ` (${escapeHtml(initiativeId)})` : ""}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    color-scheme: light;
    --bg: #f5f5f0;
    --ink: #1b1b1b;
    --muted: #666;
    --accent: #0b5394;
    --border: #d9d9d9;
    --warn: #b45309;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink);
    font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
  .deck { max-width: 960px; margin: 0 auto; padding: 48px 56px; }
  .slide { background: white; border: 1px solid var(--border); border-radius: 12px;
    padding: 40px 48px; margin-bottom: 24px; page-break-after: always; min-height: 540px;
    display: flex; flex-direction: column; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px;
    font-weight: 700; color: var(--muted); margin: 0 0 6px; }
  h1 { font-size: 34px; margin: 0 0 8px; line-height: 1.2; }
  h2 { font-size: 22px; margin: 0 0 12px; }
  h3 { font-size: 14px; margin: 20px 0 6px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.06em; }
  p { line-height: 1.55; }
  p.muted, .muted { color: var(--muted); }
  table.kv { border-collapse: collapse; width: 100%; font-size: 13px; }
  table.kv th, table.kv td { text-align: left; padding: 6px 10px;
    border-bottom: 1px solid var(--border); vertical-align: top; }
  table.kv th { width: 35%; color: var(--muted); font-weight: 500; }
  .chip { display: inline-block; padding: 2px 10px; border-radius: 999px;
    border: 1px solid var(--border); background: #fafafa; font-size: 12px;
    margin-right: 6px; margin-bottom: 4px; }
  .chip-accent { background: #eef4fa; border-color: #bcd5ec; color: var(--accent); }
  .chip-warn { background: #fef3c7; border-color: #f4c265; color: var(--warn); }
  .footer { margin-top: auto; font-size: 11px; color: var(--muted); border-top: 1px solid var(--border);
    padding-top: 12px; display: flex; justify-content: space-between; }
  @media print {
    body { background: white; }
    .deck { padding: 0; max-width: none; }
    .slide { border: none; border-radius: 0; box-shadow: none; padding: 48px; }
  }
</style>
</head>
<body>
<main class="deck">
  <section class="slide">
    <p class="eyebrow">Portfolio Insights · Initiative proposal</p>
    <h1>${escapeHtml(rec.title)}</h1>
    <p>
      <span class="chip chip-accent">${escapeHtml(rec.kind.replace(/_/g, " "))}</span>
      <span class="chip">${escapeHtml(rec.confidence)} confidence</span>
      <span class="chip chip-warn">${escapeHtml(rec.estimated_cost)}</span>
      ${initiativeId ? `<span class="chip">${escapeHtml(initiativeId)}</span>` : ""}
    </p>
    <h3>Why now</h3>
    <p>${escapeHtml(rec.reasoning)}</p>
    <div class="footer">
      <span>Generated ${escapeHtml(generatedAt)}</span>
      <span>Qontrol · Portfolio Insights</span>
    </div>
  </section>

  <section class="slide">
    <p class="eyebrow">Scope</p>
    <h2>What this initiative covers</h2>
    <h3>Target</h3>
    ${kvTable(rec.target_scope)}
    <h3>Expected impact</h3>
    ${kvTable(rec.expected_impact)}
    <div class="footer">
      <span>${initiativeId ? escapeHtml(initiativeId) : "Unlogged proposal"}</span>
      <span>Qontrol · Portfolio Insights</span>
    </div>
  </section>

  <section class="slide">
    <p class="eyebrow">Measurement plan</p>
    <h2>How we will know it worked</h2>
    <p>
      On effective date, Qontrol will attach this initiative as a dashed-line marker to its
      target KPI. A pre/post window of 4 weeks on each side will drive the delta readout that
      shows up in the Portfolio Insights decision ledger. If no material movement is observed
      after eight weeks, the initiative is flagged "flat" and returns to the recommendation
      queue for re-scoping.
    </p>
    <h3>Cost vs avoidance</h3>
    <p>
      Estimated cost: <strong>${escapeHtml(rec.estimated_cost)}</strong>. Expected avoidance
      is derived from the cost ribbon context on the Portfolio Insights page; dollar values
      marked "est." are extrapolations from current weekly cost trajectory, not bookings.
    </p>
    <div class="footer">
      <span>Generated ${escapeHtml(generatedAt)}</span>
      <span>Qontrol · Portfolio Insights</span>
    </div>
  </section>
</main>
</body>
</html>`;
}

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "deck";
}

export async function POST(request: Request) {
  let body: { recommendation?: Recommendation; initiative_id?: string | null };
  try {
    body = (await request.json()) as {
      recommendation?: Recommendation;
      initiative_id?: string | null;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rec = body.recommendation;
  if (!rec || !rec.title) {
    return NextResponse.json({ error: "Missing `recommendation`" }, { status: 400 });
  }

  const initiativeId = body.initiative_id?.trim() || null;
  const generatedAt = new Date().toISOString();
  const html = renderDeckHtml({ initiativeId, recommendation: rec, generatedAt });

  const tsSlug = generatedAt.replace(/[:.]/g, "-");
  const baseId = initiativeId ?? `rec-${safeSlug(rec.title)}`;
  const filename = `${baseId}-${tsSlug}.html`;

  const absDir = path.join(process.cwd(), DECK_ROOT_REL);
  const absPath = path.join(absDir, filename);

  try {
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absPath, html, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to write deck", details: msg },
      { status: 500 },
    );
  }

  const publicUrl = `/reports/initiative-decks/${filename}`;

  if (initiativeId) {
    try {
      await postgrestRequest("qontrol_initiative", {
        method: "PATCH",
        query: { initiative_id: `eq.${initiativeId}` },
        body: { deck_url: publicUrl, updated_at: generatedAt },
      });
    } catch {
      // Deck is still valid even if the PATCH fails; surface a soft warning.
      return NextResponse.json({
        deck_url: publicUrl,
        patched: false,
        warning: "Deck saved but deck_url PATCH on initiative failed.",
      });
    }
  }

  return NextResponse.json({
    deck_url: publicUrl,
    patched: Boolean(initiativeId),
    generatedAt,
  });
}
