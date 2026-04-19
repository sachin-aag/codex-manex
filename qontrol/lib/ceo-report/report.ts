import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { buildCeoReportData } from "./data";
import type { CeoReportArtifactMetadata, CeoReportData } from "./types";

const execFileAsync = promisify(execFile);

const REPORT_ROOT = path.join(process.cwd(), "public", "reports", "ceo-weekly");
const LATEST_METADATA_PATH = path.join(REPORT_ROOT, "latest.json");
const BUILDER_DIR = path.join(process.cwd(), "lib", "ceo-report", "builder");
const BUILDER_SCRIPT_PATH = path.join(BUILDER_DIR, "ceo-report-builder.mjs");
const ARTIFACT_TOOL_DIR = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  "@oai",
  "artifact-tool",
);

const SLIDE_TITLES = [
  "Executive overview",
  "High-severity tickets",
  "Open-ticket portfolio",
  "Big-picture updates",
] as const;

function getReportDirectory(reportId: string) {
  return path.join(REPORT_ROOT, reportId);
}

function publicUrlFor(reportId: string, filename: string) {
  return `/reports/ceo-weekly/${reportId}/${filename}`;
}

function publicFileFor(url: string) {
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureBuilderRuntime() {
  const scopedDir = path.join(BUILDER_DIR, "node_modules", "@oai");
  const linkPath = path.join(scopedDir, "artifact-tool");

  await fs.mkdir(scopedDir, { recursive: true });

  try {
    const existing = await fs.readlink(linkPath);
    if (existing === ARTIFACT_TOOL_DIR) return;
    await fs.rm(linkPath, { recursive: true, force: true });
  } catch {
    if (await pathExists(linkPath)) {
      await fs.rm(linkPath, { recursive: true, force: true });
    }
  }

  await fs.symlink(ARTIFACT_TOOL_DIR, linkPath, "dir");
}

async function runDeckBuilder(data: CeoReportData) {
  const outputDir = getReportDirectory(data.reportId);
  await fs.mkdir(REPORT_ROOT, { recursive: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await ensureBuilderRuntime();

  const inputPath = path.join(outputDir, "deck-input.json");
  await fs.writeFile(inputPath, JSON.stringify(data, null, 2), "utf8");

  try {
    await execFileAsync(process.execPath, [BUILDER_SCRIPT_PATH, inputPath, outputDir], {
      cwd: BUILDER_DIR,
      maxBuffer: 1024 * 1024 * 10,
    });
  } finally {
    await fs.rm(inputPath, { force: true });
  }
}

function buildMetadata(data: CeoReportData): CeoReportArtifactMetadata {
  return {
    reportId: data.reportId,
    generatedAt: data.generatedAt,
    nextGenerationAt: data.nextGenerationAt,
    title: data.title,
    subtitle: data.subtitle,
    downloadUrl: publicUrlFor(data.reportId, "report.pptx"),
    slides: SLIDE_TITLES.map((title, index) => ({
      title,
      imageUrl: publicUrlFor(
        data.reportId,
        `slide-${String(index + 1).padStart(2, "0")}.png`,
      ),
    })),
    summary: data.summary,
    laggingTeam: data.laggingTeam,
    highSeverityTicketCount: data.highSeverityTickets.length,
    narrativeCards: data.narrativeCards,
  };
}

async function writeMetadata(metadata: CeoReportArtifactMetadata) {
  const outputDir = getReportDirectory(metadata.reportId);
  await fs.writeFile(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );
  await fs.writeFile(LATEST_METADATA_PATH, JSON.stringify(metadata, null, 2), "utf8");
}

async function readJsonFile<T>(targetPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function isMetadataUsable(metadata: CeoReportArtifactMetadata | null) {
  if (!metadata) return false;
  const required = [
    metadata.downloadUrl,
    ...metadata.slides.map((slide) => slide.imageUrl),
  ].map(publicFileFor);
  const checks = await Promise.all(required.map((filePath) => pathExists(filePath)));
  return checks.every(Boolean);
}

export async function generateCeoReport(): Promise<CeoReportArtifactMetadata> {
  const data = await buildCeoReportData();
  await runDeckBuilder(data);
  const metadata = buildMetadata(data);
  await writeMetadata(metadata);
  return metadata;
}

export async function getCeoReport(): Promise<CeoReportArtifactMetadata> {
  const latest = await readJsonFile<CeoReportArtifactMetadata>(LATEST_METADATA_PATH);
  if (await isMetadataUsable(latest)) {
    return latest!;
  }
  return generateCeoReport();
}
