import fs from "node:fs/promises";
import path from "node:path";

const artifactToolSpecifier =
  process.env.CEO_REPORT_ARTIFACT_TOOL_ENTRY ?? "@oai/artifact-tool";
const { Presentation, PresentationFile } = await import(artifactToolSpecifier);

const WIDTH = 1280;
const HEIGHT = 720;
const COLORS = {
  bg: "#F5F7F8",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  border: "#D8E0E6",
  text: "#17212B",
  textMuted: "#52616F",
  brand: "#0F8E8D",
  brandStrong: "#0B706F",
  brandSoft: "#E6F7F7",
  success: "#1A8D55",
  successSoft: "#EAF7F0",
  warning: "#B66A00",
  warningSoft: "#FFF5DF",
  danger: "#BF3F35",
  dangerSoft: "#FFF0EE",
  slate: "#6B7C8D",
};
const FONT = {
  title: "Aptos Display",
  body: "Aptos",
  mono: "Aptos Mono",
};

function addShape(slide, opts) {
  return slide.shapes.add({
    geometry: opts.geometry ?? "rect",
    position: opts.position,
    fill: opts.fill ?? COLORS.surface,
    line: opts.line ?? { width: 0, fill: opts.fill ?? COLORS.surface },
  });
}

function addText(slide, text, position, options = {}) {
  const shape = slide.shapes.add({
    geometry: options.geometry ?? "rect",
    position,
    fill: options.fill ?? "#FFFFFF00",
    line: options.line ?? { width: 0, fill: "#FFFFFF00" },
  });
  shape.text = text;
  shape.text.fontSize = options.fontSize ?? 20;
  shape.text.typeface = options.typeface ?? FONT.body;
  shape.text.color = options.color ?? COLORS.text;
  shape.text.bold = options.bold ?? false;
  shape.text.alignment = options.alignment ?? "left";
  shape.text.verticalAlignment = options.verticalAlignment ?? "middle";
  shape.text.insets = options.insets ?? { left: 8, right: 8, top: 4, bottom: 4 };
  if (options.autoFit) {
    shape.text.autoFit = options.autoFit;
  }
  return shape;
}

function addPanel(slide, position, fill = COLORS.surface) {
  return addShape(slide, {
    geometry: "roundRect",
    position,
    fill,
    line: { width: 1, fill: COLORS.border },
  });
}

function addHeader(slide, eyebrow, title, subtitle) {
  addText(slide, eyebrow, { left: 72, top: 46, width: 280, height: 24 }, {
    fontSize: 16,
    color: COLORS.brandStrong,
    bold: true,
    typeface: FONT.body,
  });
  addText(slide, title, { left: 72, top: 76, width: 760, height: 54 }, {
    fontSize: 28,
    bold: true,
    typeface: FONT.title,
    color: COLORS.text,
  });
  addText(slide, subtitle, { left: 72, top: 126, width: 760, height: 40 }, {
    fontSize: 16,
    color: COLORS.textMuted,
  });
}

function addMetricChip(slide, label, value, left) {
  addPanel(slide, { left, top: 486, width: 220, height: 112 }, COLORS.surface);
  addText(slide, label, { left: left + 18, top: 506, width: 180, height: 22 }, {
    fontSize: 14,
    color: COLORS.textMuted,
    bold: true,
  });
  addText(slide, value, { left: left + 18, top: 536, width: 180, height: 42 }, {
    fontSize: 32,
    typeface: FONT.title,
    bold: true,
    color: COLORS.text,
  });
}

function statusColors(code) {
  if (code === "closed") return { fill: COLORS.successSoft, text: COLORS.success };
  if (code === "unassigned") return { fill: COLORS.dangerSoft, text: COLORS.danger };
  if (code === "assigned") return { fill: COLORS.warningSoft, text: COLORS.warning };
  if (code === "returned_to_qm_for_verification") {
    return { fill: COLORS.brandSoft, text: COLORS.brandStrong };
  }
  return { fill: COLORS.surfaceSoft, text: COLORS.slate };
}

function addStatusPill(slide, snapshot, left, top, width) {
  const colors = statusColors(snapshot.code);
  addShape(slide, {
    geometry: "roundRect",
    position: { left, top, width, height: 30 },
    fill: colors.fill,
    line: { width: 0, fill: colors.fill },
  });
  addText(slide, snapshot.label, { left: left + 6, top: top + 2, width: width - 12, height: 24 }, {
    fontSize: 13,
    color: colors.text,
    bold: true,
    alignment: "center",
  });
}

function buildSlide1(presentation, data) {
  const slide = presentation.slides.add();
  addShape(slide, {
    position: { left: 0, top: 0, width: WIDTH, height: HEIGHT },
    fill: COLORS.bg,
    line: { width: 0, fill: COLORS.bg },
  });
  addShape(slide, {
    geometry: "roundRect",
    position: { left: 58, top: 42, width: 1164, height: 636 },
    fill: COLORS.surface,
    line: { width: 0, fill: COLORS.surface },
  });
  addShape(slide, {
    geometry: "roundRect",
    position: { left: 58, top: 42, width: 1164, height: 152 },
    fill: COLORS.brandSoft,
    line: { width: 0, fill: COLORS.brandSoft },
  });
  addShape(slide, {
    geometry: "ellipse",
    position: { left: 964, top: 70, width: 182, height: 182 },
    fill: "#D6F2F1",
    line: { width: 0, fill: "#D6F2F1" },
  });
  addShape(slide, {
    geometry: "ellipse",
    position: { left: 1032, top: 120, width: 88, height: 88 },
    fill: COLORS.brand,
    line: { width: 0, fill: COLORS.brand },
  });
  addShape(slide, {
    geometry: "roundRect",
    position: { left: 84, top: 70, width: 54, height: 54 },
    fill: COLORS.brand,
    line: { width: 0, fill: COLORS.brand },
  });
  addText(slide, "Q", { left: 92, top: 78, width: 38, height: 36 }, {
    fontSize: 24,
    bold: true,
    color: "#FFFFFF",
    alignment: "center",
    typeface: FONT.title,
  });
  addText(slide, "Qontrol", { left: 150, top: 78, width: 180, height: 34 }, {
    fontSize: 22,
    bold: true,
    typeface: FONT.title,
    color: COLORS.brandStrong,
  });
  addText(slide, "Weekly CEO Report", { left: 84, top: 236, width: 560, height: 62 }, {
    fontSize: 34,
    bold: true,
    typeface: FONT.title,
    color: COLORS.text,
  });
  addText(slide, data.subtitle, { left: 84, top: 304, width: 680, height: 38 }, {
    fontSize: 18,
    color: COLORS.textMuted,
  });
  addShape(slide, {
    geometry: "roundRect",
    position: { left: 84, top: 360, width: 330, height: 58 },
    fill: COLORS.brand,
    line: { width: 0, fill: COLORS.brand },
  });
  addText(slide, `Generated ${new Date(data.generatedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`, { left: 98, top: 374, width: 300, height: 28 }, {
    fontSize: 15,
    color: "#FFFFFF",
    bold: true,
  });
  addText(
    slide,
    "Prepared for the weekly executive quality review. This deck combines the live open-ticket portfolio with seeded context where historical closure data is still sparse.",
    { left: 84, top: 432, width: 680, height: 52 },
    {
      fontSize: 16,
      color: COLORS.textMuted,
    },
  );
  addMetricChip(slide, "Open tickets", String(data.summary.openTickets), 84);
  addMetricChip(slide, "High severity", String(data.summary.highSeverityOpen), 322);
  addMetricChip(slide, "Overdue follow-up", String(data.summary.overdueOpen), 560);

  addPanel(slide, { left: 840, top: 286, width: 316, height: 312 }, COLORS.surface);
  addText(slide, "Executive focus", { left: 866, top: 312, width: 220, height: 26 }, {
    fontSize: 16,
    color: COLORS.textMuted,
    bold: true,
  });
  addText(slide, data.laggingTeam.headline, { left: 866, top: 348, width: 256, height: 70 }, {
    fontSize: 24,
    bold: true,
    typeface: FONT.title,
    color: data.laggingTeam.isFlagged ? COLORS.danger : COLORS.brandStrong,
  });
  addText(slide, data.laggingTeam.reason, { left: 866, top: 430, width: 256, height: 96 }, {
    fontSize: 15,
    color: COLORS.textMuted,
  });
  addShape(slide, {
    geometry: "roundRect",
    position: { left: 866, top: 548, width: 160, height: 32 },
    fill: data.laggingTeam.isFlagged ? COLORS.dangerSoft : COLORS.successSoft,
    line: { width: 0, fill: data.laggingTeam.isFlagged ? COLORS.dangerSoft : COLORS.successSoft },
  });
  addText(
    slide,
    data.laggingTeam.isFlagged ? "Needs executive attention" : "Portfolio in balance",
    { left: 874, top: 553, width: 144, height: 20 },
    {
      fontSize: 12,
      color: data.laggingTeam.isFlagged ? COLORS.danger : COLORS.success,
      bold: true,
      alignment: "center",
    },
  );
}

function buildSlide2(presentation, data) {
  const slide = presentation.slides.add();
  addShape(slide, {
    position: { left: 0, top: 0, width: WIDTH, height: HEIGHT },
    fill: COLORS.bg,
    line: { width: 0, fill: COLORS.bg },
  });
  addHeader(
    slide,
    "High-severity workflow",
    "Specific tickets and weekly status movement",
    `Current live backlog for the top high-severity tickets. Comparing ${data.summary.comparisonLastWeekLabel} to ${data.summary.comparisonThisWeekLabel}.`,
  );
  addPanel(slide, { left: 58, top: 182, width: 1164, height: 474 }, COLORS.surface);

  const columns = [
    { label: "Ticket", left: 84, width: 112 },
    { label: "Issue", left: 208, width: 330 },
    { label: "Team", left: 550, width: 72 },
    { label: `Status ${data.summary.comparisonLastWeekLabel}`, left: 640, width: 158 },
    { label: `Status ${data.summary.comparisonThisWeekLabel}`, left: 812, width: 158 },
    { label: "Owner", left: 984, width: 160 },
  ];

  addShape(slide, {
    position: { left: 82, top: 214, width: 1116, height: 42 },
    fill: COLORS.surfaceSoft,
    line: { width: 0, fill: COLORS.surfaceSoft },
  });

  for (const column of columns) {
    addText(slide, column.label, { left: column.left, top: 222, width: column.width, height: 20 }, {
      fontSize: 13,
      bold: true,
      color: COLORS.textMuted,
    });
  }

  const rows = data.highSeverityTickets.length > 0
    ? data.highSeverityTickets
    : [
        {
          id: "No live high-severity tickets",
          title: "The current dataset has no open high-severity tickets.",
          team: "RD",
          assignee: "QM",
          ownerTeam: "Qontrol",
          statusLastWeek: { code: "closed", label: "Closed" },
          statusThisWeek: { code: "closed", label: "Closed" },
          overdue: false,
          lastUpdateAt: data.generatedAt,
          sourceType: "defect",
        },
      ];

  rows.forEach((row, index) => {
    const top = 270 + index * 56;
    addShape(slide, {
      position: { left: 82, top, width: 1116, height: 48 },
      fill: index % 2 === 0 ? COLORS.surface : "#FBFCFD",
      line: { width: 0, fill: index % 2 === 0 ? COLORS.surface : "#FBFCFD" },
    });
    addText(slide, row.id, { left: 84, top: top + 10, width: 112, height: 22 }, {
      fontSize: 13,
      bold: true,
      color: COLORS.brandStrong,
      typeface: FONT.mono,
    });
    addText(slide, row.title, { left: 208, top: top + 8, width: 330, height: 26 }, {
      fontSize: 13,
      color: COLORS.text,
    });
    addText(slide, row.team, { left: 550, top: top + 10, width: 52, height: 22 }, {
      fontSize: 13,
      bold: true,
      color: row.overdue ? COLORS.danger : COLORS.text,
      alignment: "center",
      typeface: FONT.mono,
    });
    addStatusPill(slide, row.statusLastWeek, 644, top + 9, 148);
    addStatusPill(slide, row.statusThisWeek, 816, top + 9, 148);
    addText(slide, row.assignee, { left: 984, top: top + 10, width: 160, height: 22 }, {
      fontSize: 13,
      color: COLORS.text,
    });
    if (row.overdue) {
      addShape(slide, {
        geometry: "ellipse",
        position: { left: 1170, top: top + 16, width: 12, height: 12 },
        fill: COLORS.danger,
        line: { width: 0, fill: COLORS.danger },
      });
    }
  });

  addText(
    slide,
    "Red dots mark cases where the current follow-up window has elapsed and leadership intervention may be needed.",
    { left: 84, top: 618, width: 760, height: 20 },
    {
      fontSize: 13,
      color: COLORS.textMuted,
    },
  );
}

function drawLegend(slide, items, left, top) {
  items.forEach((item, index) => {
    const x = left + index * 110;
    addShape(slide, {
      geometry: "roundRect",
      position: { left: x, top, width: 14, height: 14 },
      fill: item.color,
      line: { width: 0, fill: item.color },
    });
    addText(slide, item.label, { left: x + 20, top: top - 2, width: 84, height: 18 }, {
      fontSize: 12,
      color: COLORS.textMuted,
      bold: true,
    });
  });
}

function drawStackedPortfolioChart(slide, rows, left, top, width, height) {
  const maxTotal = Math.max(...rows.map((row) => row.total), 1);
  const chartLeft = left + 42;
  const chartTop = top + 20;
  const chartWidth = width - 68;
  const chartHeight = height - 72;
  const barWidth = 92;
  const gap = Math.max(34, (chartWidth - rows.length * barWidth) / Math.max(rows.length - 1, 1));
  const tickCount = 4;

  addShape(slide, {
    position: { left: chartLeft, top: chartTop, width: chartWidth, height: chartHeight },
    fill: COLORS.surfaceSoft,
    line: { width: 0, fill: COLORS.surfaceSoft },
  });

  for (let tick = 0; tick <= tickCount; tick += 1) {
    const value = Math.round((maxTotal / tickCount) * tick);
    const y = chartTop + chartHeight - (chartHeight / tickCount) * tick;
    addShape(slide, {
      position: { left: chartLeft, top: y, width: chartWidth, height: 1 },
      fill: COLORS.border,
      line: { width: 0, fill: COLORS.border },
    });
    addText(slide, String(value), { left: left, top: y - 10, width: 32, height: 16 }, {
      fontSize: 11,
      color: COLORS.textMuted,
      alignment: "right",
      typeface: FONT.mono,
    });
  }

  rows.forEach((row, index) => {
    const x = chartLeft + index * (barWidth + gap) + 18;
    let running = 0;
    const segments = [
      { value: row.low, color: COLORS.brand },
      { value: row.medium, color: COLORS.warning },
      { value: row.high, color: COLORS.danger },
    ];
    segments.forEach((segment) => {
      if (segment.value <= 0) return;
      const h = Math.max(8, (segment.value / maxTotal) * (chartHeight - 14));
      addShape(slide, {
        geometry: "roundRect",
        position: { left: x, top: chartTop + chartHeight - running - h, width: barWidth, height: h },
        fill: segment.color,
        line: { width: 0, fill: segment.color },
      });
      running += h;
    });
    addText(slide, row.team, { left: x, top: chartTop + chartHeight + 10, width: barWidth, height: 20 }, {
      fontSize: 13,
      bold: true,
      alignment: "center",
      typeface: FONT.mono,
    });
    addText(slide, `${row.total} open`, { left: x, top: chartTop + chartHeight + 28, width: barWidth, height: 18 }, {
      fontSize: 11,
      color: COLORS.textMuted,
      alignment: "center",
    });
  });

  drawLegend(
    slide,
    [
      { label: "Low", color: COLORS.brand },
      { label: "Medium", color: COLORS.warning },
      { label: "High", color: COLORS.danger },
    ],
    chartLeft,
    top + height - 26,
  );
}

function drawTrendBars(slide, points, left, top, width, height) {
  const maxValue = Math.max(...points.map((point) => point.incidents), 1);
  const chartLeft = left + 40;
  const chartTop = top + 20;
  const chartWidth = width - 60;
  const chartHeight = height - 66;
  const barCount = points.length;
  const gap = 8;
  const barWidth = Math.max(14, (chartWidth - (barCount - 1) * gap) / Math.max(barCount, 1));
  const tickCount = 4;

  addShape(slide, {
    position: { left: chartLeft, top: chartTop, width: chartWidth, height: chartHeight },
    fill: COLORS.surfaceSoft,
    line: { width: 0, fill: COLORS.surfaceSoft },
  });

  for (let tick = 0; tick <= tickCount; tick += 1) {
    const value = Math.round((maxValue / tickCount) * tick);
    const y = chartTop + chartHeight - (chartHeight / tickCount) * tick;
    addShape(slide, {
      position: { left: chartLeft, top: y, width: chartWidth, height: 1 },
      fill: COLORS.border,
      line: { width: 0, fill: COLORS.border },
    });
    addText(slide, String(value), { left, top: y - 10, width: 28, height: 16 }, {
      fontSize: 11,
      color: COLORS.textMuted,
      alignment: "right",
      typeface: FONT.mono,
    });
  }

  points.forEach((point, index) => {
    const x = chartLeft + index * (barWidth + gap);
    const barHeight = Math.max(8, (point.incidents / maxValue) * (chartHeight - 14));
    const isPeak = point.incidents === maxValue;
    const fill = isPeak ? COLORS.danger : point.incidents >= maxValue * 0.7 ? COLORS.warning : COLORS.brand;
    addShape(slide, {
      geometry: "roundRect",
      position: { left: x, top: chartTop + chartHeight - barHeight, width: barWidth, height: barHeight },
      fill,
      line: { width: 0, fill },
    });
    if (index % 2 === 0 || index === points.length - 1) {
      addText(slide, point.label, { left: x - 4, top: chartTop + chartHeight + 8, width: barWidth + 8, height: 18 }, {
        fontSize: 10,
        color: COLORS.textMuted,
        alignment: "center",
      });
    }
  });
}

function buildSlide3(presentation, data) {
  const slide = presentation.slides.add();
  addShape(slide, {
    position: { left: 0, top: 0, width: WIDTH, height: HEIGHT },
    fill: COLORS.bg,
    line: { width: 0, fill: COLORS.bg },
  });
  addHeader(
    slide,
    "Portfolio view",
    "Open-ticket load by team and priority",
    "Live backlog grouped by routing team. Priority mix highlights where executive attention may be required.",
  );
  addPanel(slide, { left: 58, top: 182, width: 790, height: 474 }, COLORS.surface);
  addPanel(slide, { left: 870, top: 182, width: 352, height: 474 }, COLORS.surface);
  drawStackedPortfolioChart(slide, data.teamPortfolio, 86, 226, 734, 350);

  addText(slide, data.laggingTeam.headline, { left: 896, top: 228, width: 298, height: 72 }, {
    fontSize: 24,
    bold: true,
    typeface: FONT.title,
    color: data.laggingTeam.isFlagged ? COLORS.danger : COLORS.brandStrong,
  });
  addText(slide, data.laggingTeam.reason, { left: 896, top: 304, width: 298, height: 110 }, {
    fontSize: 15,
    color: COLORS.textMuted,
  });

  data.teamPortfolio.forEach((row, index) => {
    const top = 432 + index * 62;
    addShape(slide, {
      geometry: "roundRect",
      position: { left: 896, top, width: 298, height: 48 },
      fill: index % 2 === 0 ? COLORS.surfaceSoft : COLORS.surface,
      line: { width: 0, fill: index % 2 === 0 ? COLORS.surfaceSoft : COLORS.surface },
    });
    addText(slide, row.team, { left: 910, top: top + 10, width: 40, height: 22 }, {
      fontSize: 14,
      bold: true,
      typeface: FONT.mono,
      color: COLORS.text,
      alignment: "center",
    });
    addText(
      slide,
      `${row.total} open | ${row.high} high | ${row.overdue} overdue`,
      { left: 966, top: top + 10, width: 208, height: 22 },
      {
        fontSize: 14,
        color: COLORS.text,
      },
    );
  });
}

function buildSlide4(presentation, data) {
  const slide = presentation.slides.add();
  addShape(slide, {
    position: { left: 0, top: 0, width: WIDTH, height: HEIGHT },
    fill: COLORS.bg,
    line: { width: 0, fill: COLORS.bg },
  });
  addHeader(
    slide,
    "Big-picture updates",
    "Trend signals for the executive narrative",
    "A management narrative built from live portfolio signals with light historical backfill where closure data remains sparse.",
  );
  addPanel(slide, { left: 58, top: 182, width: 680, height: 474 }, COLORS.surface);
  addPanel(slide, { left: 760, top: 182, width: 462, height: 474 }, COLORS.surface);
  drawTrendBars(slide, data.trendSeries.slice(-10), 86, 226, 624, 344);

  addText(
    slide,
    "The trend highlights the December defect spike and the softer run rate visible after the supplier transition.",
    { left: 86, top: 588, width: 624, height: 32 },
    {
      fontSize: 14,
      color: COLORS.textMuted,
    },
  );

  data.narrativeCards.forEach((card, index) => {
    const cardHeight = 126;
    const cardGap = 12;
    const top = 208 + index * (cardHeight + cardGap);
    const accent =
      card.tone === "positive"
        ? COLORS.success
        : card.tone === "watch"
          ? COLORS.danger
          : COLORS.brand;
    const accentSoft =
      card.tone === "positive"
        ? COLORS.successSoft
        : card.tone === "watch"
          ? COLORS.dangerSoft
          : COLORS.brandSoft;
    addShape(slide, {
      geometry: "roundRect",
      position: { left: 786, top, width: 410, height: cardHeight },
      fill: accentSoft,
      line: { width: 0, fill: accentSoft },
    });
    addText(slide, card.title, { left: 806, top: top + 12, width: 232, height: 40 }, {
      fontSize: 17,
      bold: true,
      typeface: FONT.title,
      color: accent,
      verticalAlignment: "top",
      insets: { left: 0, right: 6, top: 0, bottom: 0 },
      autoFit: "shrinkText",
    });
    addText(slide, card.metricValue, { left: 1080, top: top + 10, width: 90, height: 34 }, {
      fontSize: 22,
      bold: true,
      alignment: "right",
      verticalAlignment: "top",
      typeface: FONT.title,
      color: COLORS.text,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
      autoFit: "shrinkText",
    });
    addText(slide, card.metricLabel, { left: 1062, top: top + 40, width: 108, height: 28 }, {
      fontSize: 10,
      color: COLORS.textMuted,
      alignment: "right",
      verticalAlignment: "top",
      bold: true,
      insets: { left: 4, right: 0, top: 0, bottom: 0 },
      autoFit: "shrinkText",
    });
    addText(slide, card.body, { left: 806, top: top + 60, width: 252, height: 52 }, {
      fontSize: 12,
      color: COLORS.text,
      verticalAlignment: "top",
      insets: { left: 0, right: 12, top: 0, bottom: 0 },
      autoFit: "shrinkText",
    });
  });
}

async function renderSlides(presentation, outputDir) {
  const slides = presentation.slides.items ?? [];
  for (const [index, slide] of slides.entries()) {
    const png = await presentation.export({ slide, format: "png", scale: 1 });
    const buffer = Buffer.from(await png.arrayBuffer());
    await fs.writeFile(
      path.join(outputDir, `slide-${String(index + 1).padStart(2, "0")}.png`),
      buffer,
    );
  }
}

async function main() {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3];
  if (!inputPath || !outputDir) {
    throw new Error("Usage: node ceo-report-builder.mjs <input-json> <output-dir>");
  }

  const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const presentation = Presentation.create({
    slideSize: { width: WIDTH, height: HEIGHT },
  });

  buildSlide1(presentation, data);
  buildSlide2(presentation, data);
  buildSlide3(presentation, data);
  buildSlide4(presentation, data);

  await renderSlides(presentation, outputDir);
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(path.join(outputDir, "report.pptx"));
}

await main();
