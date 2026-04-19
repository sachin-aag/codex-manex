import fs from "node:fs/promises";
import path from "node:path";

const DOC_FILES = [
  "CASE.md",
  "QUICKSTART.md",
  "API_REFERENCE.md",
  "SCHEMA.md",
  "DATA_PATTERNS.md",
] as const;

let docsBundlePromise: Promise<string> | null = null;

async function loadDoc(name: (typeof DOC_FILES)[number]): Promise<string | null> {
  try {
    const docsPath = path.resolve(process.cwd(), "..", "docs", name);
    const content = await fs.readFile(docsPath, "utf8");
    return `## ${name}\n${content.trim()}`;
  } catch {
    return null;
  }
}

async function buildDocsBundle(): Promise<string> {
  const sections = await Promise.all(DOC_FILES.map((name) => loadDoc(name)));
  const available = sections.filter((section): section is string => Boolean(section));

  if (!available.length) {
    return "@docs\nRepository docs could not be loaded from docs/.";
  }

  return [
    "@docs",
    "Repository reference bundle. Use this as the source of truth for the challenge framing, schema, API usage, and known seeded data patterns.",
    ...available,
  ].join("\n\n");
}

export async function getInsightsDocsContext(): Promise<string> {
  if (!docsBundlePromise) {
    docsBundlePromise = buildDocsBundle();
  }
  return docsBundlePromise;
}
