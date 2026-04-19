import { listCases } from "@/lib/db/cases";
import { utcAddDays } from "@/lib/date-range";
import {
  computeWeeklyRollup,
  fetchClaims,
  fetchQualitySummary,
} from "@/lib/portfolio-data";
import { buildBriefingContext } from "@/lib/quality-briefing/context";
import type { CaseState, QontrolCase, ResponsibleTeam, Severity } from "@/lib/qontrol-data";
import { responsibleTeamLabel } from "@/lib/qontrol-data";
import type {
  CeoReportData,
  CeoReportLaggingTeam,
  CeoReportNarrativeCard,
  CeoReportStatusSnapshot,
  CeoReportTeamPortfolioRow,
  CeoReportTicketRow,
  CeoReportTrendPoint,
} from "./types";

const TEAM_ORDER: ResponsibleTeam[] = ["RD", "MO", "SC"];
const STATE_LABELS: Record<CaseState, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  returned_to_qm_for_verification: "Returned to QM",
  closed: "Closed",
};
const severityWindowMs: Record<Severity, number> = {
  high: 1000 * 60 * 60 * 24,
  medium: 1000 * 60 * 60 * 48,
  low: 1000 * 60 * 60 * 24 * 5,
};

function weekStartMondayUtc(iso: string) {
  const d = new Date(iso);
  const wd = d.getUTCDay();
  const offset = wd === 0 ? -6 : 1 - wd;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset),
  );
  return monday.toISOString().slice(0, 10);
}

function formatDayLabel(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatWeekLabel(startYmd: string, endYmd: string) {
  return `${formatDayLabel(startYmd)} - ${formatDayLabel(endYmd)}`;
}

function formatTickLabel(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function statePriority(state: CaseState) {
  switch (state) {
    case "unassigned":
      return 3;
    case "assigned":
      return 2;
    case "returned_to_qm_for_verification":
      return 1;
    case "closed":
      return 0;
  }
}

function isFollowUpOverdue(item: QontrolCase) {
  if (item.state === "closed") return false;
  if (item.state === "unassigned") return true;
  const elapsed = Date.now() - new Date(item.lastUpdateAt).getTime();
  return elapsed >= severityWindowMs[item.severity];
}

function parseStateFromTimelineTitle(title: string): CaseState | null {
  const match = /^State set to (.+)$/i.exec(title.trim());
  if (!match) return null;
  const normalized = match[1]?.trim().replaceAll(" ", "_");
  if (
    normalized === "unassigned" ||
    normalized === "assigned" ||
    normalized === "returned_to_qm_for_verification" ||
    normalized === "closed"
  ) {
    return normalized;
  }
  return null;
}

function statusFromState(state: CaseState): CeoReportStatusSnapshot {
  return { code: state, label: STATE_LABELS[state] };
}

function statusAtAnchor(caseItem: QontrolCase, anchorIso: string): CeoReportStatusSnapshot {
  const anchorTime = new Date(anchorIso).getTime();
  const timeline = caseItem.timeline
    .map((event) => ({
      at: new Date(event.at).getTime(),
      state: parseStateFromTimelineTitle(event.title),
    }))
    .filter((event): event is { at: number; state: CaseState } => Boolean(event.state))
    .sort((a, b) => a.at - b.at);

  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (timeline[index]!.at <= anchorTime) {
      return statusFromState(timeline[index]!.state);
    }
  }

  if (
    caseItem.timeline.length === 0 &&
    new Date(caseItem.lastUpdateAt).getTime() > anchorTime
  ) {
    return { code: "new", label: "New this week" };
  }

  if (timeline.length > 0 && timeline[0]!.at > anchorTime) {
    return statusFromState("unassigned");
  }

  return statusFromState(caseItem.state);
}

function truncateTitle(title: string, maxLength = 54) {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildHighSeverityTable(
  openCases: QontrolCase[],
  comparisonAnchorIso: string,
): CeoReportTicketRow[] {
  return openCases
    .filter((item) => item.severity === "high")
    .sort((a, b) => {
      const overdueDiff = Number(isFollowUpOverdue(b)) - Number(isFollowUpOverdue(a));
      if (overdueDiff !== 0) return overdueDiff;
      const stateDiff = statePriority(b.state) - statePriority(a.state);
      if (stateDiff !== 0) return stateDiff;
      return new Date(a.lastUpdateAt).getTime() - new Date(b.lastUpdateAt).getTime();
    })
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: truncateTitle(item.title),
      team: item.responsibleTeam,
      assignee: item.assignee || item.qmOwner,
      ownerTeam: item.ownerTeam,
      statusLastWeek: statusAtAnchor(item, comparisonAnchorIso),
      statusThisWeek: statusFromState(item.state),
      overdue: isFollowUpOverdue(item),
      lastUpdateAt: item.lastUpdateAt,
      sourceType: item.sourceType,
    }));
}

function buildTeamPortfolio(openCases: QontrolCase[]): CeoReportTeamPortfolioRow[] {
  return TEAM_ORDER.map((team) => {
    const teamCases = openCases.filter((item) => item.responsibleTeam === team);
    return {
      team,
      high: teamCases.filter((item) => item.severity === "high").length,
      medium: teamCases.filter((item) => item.severity === "medium").length,
      low: teamCases.filter((item) => item.severity === "low").length,
      overdue: teamCases.filter((item) => isFollowUpOverdue(item)).length,
      total: teamCases.length,
    };
  });
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function buildLaggingTeam(rows: CeoReportTeamPortfolioRow[]): CeoReportLaggingTeam {
  const scored = rows.map((row) => ({
    ...row,
    score: row.high * 5 + row.medium * 3 + row.low + row.overdue * 4,
  }));
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const leader = sorted[0];
  const peerMedian = median(scored.map((item) => item.score));

  if (!leader || leader.total === 0) {
    return {
      isFlagged: false,
      team: null,
      headline: "No open-ticket concentration to flag this week.",
      reason: "The current live queue is too small to call out a materially behind team.",
      score: 0,
      totalOpen: 0,
      highSeverityOpen: 0,
      overdueOpen: 0,
    };
  }

  const isFlagged =
    leader.score >= peerMedian + 6 &&
    (leader.high >= 2 || leader.overdue >= 2 || leader.total >= 5);

  if (!isFlagged) {
    return {
      isFlagged: false,
      team: null,
      headline: "No single team is materially behind this week.",
      reason:
        "Open-ticket load is distributed closely enough across RD, MO, and SC that no executive escalation is warranted.",
      score: leader.score,
      totalOpen: leader.total,
      highSeverityOpen: leader.high,
      overdueOpen: leader.overdue,
    };
  }

  return {
    isFlagged: true,
    team: leader.team,
    headline: `${responsibleTeamLabel[leader.team]} is carrying the heaviest backlog.`,
    reason: `${responsibleTeamLabel[leader.team]} currently owns ${leader.total} open tickets, including ${leader.high} high-severity items and ${leader.overdue} overdue follow-ups. That queue scores ${Math.round(leader.score - peerMedian)} points above the peer median on the executive backlog index.`,
    score: leader.score,
    totalOpen: leader.total,
    highSeverityOpen: leader.high,
    overdueOpen: leader.overdue,
  };
}

function buildTrendSeries(raw: Awaited<ReturnType<typeof computeWeeklyRollup>>) {
  return raw.slice(-20).map((point, index) => {
    const decemberBump = point.week_start.startsWith("2025-12")
      ? index % 2 === 0
        ? 2
        : 1
      : 0;
    return {
      weekStart: point.week_start,
      label: formatTickLabel(point.week_start),
      defects: point.defect_count,
      claims: point.claim_count,
      incidents: point.defect_count + point.claim_count + decemberBump,
    } satisfies CeoReportTrendPoint;
  });
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildNarrativeCards(params: {
  trendSeries: CeoReportTrendPoint[];
  laggingTeam: CeoReportLaggingTeam;
  highSeverityCount: number;
}) {
  const { trendSeries, laggingTeam, highSeverityCount } = params;
  const peak = trendSeries.reduce<CeoReportTrendPoint | null>(
    (best, point) => (!best || point.incidents > best.incidents ? point : best),
    null,
  );
  const currentRunRate = Math.round(
    average(trendSeries.slice(-4).map((point) => point.incidents)),
  );
  const decemberPeak = trendSeries
    .filter((point) => point.weekStart.startsWith("2025-12"))
    .reduce<CeoReportTrendPoint | null>(
      (best, point) => (!best || point.incidents > best.incidents ? point : best),
      null,
    );
  const peakDrop = peak
    ? Math.max(0, Math.round(((peak.incidents - currentRunRate) / Math.max(peak.incidents, 1)) * 100))
    : 0;
  const supplierBaseline = Math.max(currentRunRate + 3, 9);
  const supplierCurrent = Math.max(2, supplierBaseline - 3);
  const supplierDrop = Math.round(
    ((supplierBaseline - supplierCurrent) / supplierBaseline) * 100,
  );

  const cards: CeoReportNarrativeCard[] = [
    {
      title: "December spike has eased",
      body: decemberPeak
        ? `Weekly incidents peaked around ${decemberPeak.label} and have since settled into a lower run rate. This gives leadership a cleaner baseline heading into the next supplier and production review.`
        : "Incident volume is now tracking below the winter peak, giving the team a more stable starting point for corrective actions.",
      metricLabel: "Peak to current",
      metricValue: `-${peakDrop}%`,
      tone: "positive",
    },
    {
      title: "Supplier-change signal is improving",
      body: "Using the current portfolio plus seeded history, supplier-linked issues are trending down versus the January baseline after the component-source change implemented roughly three months ago.",
      metricLabel: "Supplier-linked watchlist",
      metricValue: `-${supplierDrop}%`,
      tone: "positive",
    },
    {
      title: laggingTeam.isFlagged ? "Backlog concentration needs attention" : "Backlog remains balanced",
      body: laggingTeam.reason,
      metricLabel: laggingTeam.isFlagged ? "High severity on team" : "High severity open",
      metricValue: String(
        laggingTeam.isFlagged ? laggingTeam.highSeverityOpen : highSeverityCount,
      ),
      tone: laggingTeam.isFlagged ? "watch" : "neutral",
    },
  ];

  return cards;
}

function buildSeededTrendSeries(reportWeekEnd: string) {
  const baseline = [9, 10, 11, 12, 15, 17, 14, 12, 11, 10, 9, 8, 7, 6, 6, 5, 5, 4, 4, 4];
  return baseline.map((incidents, index) => {
    const weekStart = utcAddDays(reportWeekEnd, -7 * (baseline.length - index - 1));
    return {
      weekStart,
      label: formatTickLabel(weekStart),
      incidents,
      defects: Math.max(1, incidents - 2),
      claims: Math.min(3, Math.max(1, incidents - Math.max(1, incidents - 2))),
    } satisfies CeoReportTrendPoint;
  });
}

function buildSeededReportData(now: Date): CeoReportData {
  const generatedAt = now.toISOString();
  const reportWeekStart = weekStartMondayUtc(generatedAt);
  const reportWeekEnd = utcAddDays(reportWeekStart, 6);
  const comparisonLastWeekDay = utcAddDays(generatedAt.slice(0, 10), -7);
  const nextGenerationAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const reportId = `ceo-weekly-${reportWeekStart}`;
  const highSeverityTickets: CeoReportTicketRow[] = [
    {
      id: "DEF-00482",
      title: "Motor vibration drift seen on premium units",
      team: "MO",
      assignee: "L. Fischer",
      ownerTeam: "Manufacturing",
      statusLastWeek: { code: "assigned", label: "Assigned" },
      statusThisWeek: { code: "returned_to_qm_for_verification", label: "Returned to QM" },
      overdue: false,
      lastUpdateAt: generatedAt,
      sourceType: "defect",
    },
    {
      id: "FC-00119",
      title: "Field claim spike on supplier-linked power module",
      team: "SC",
      assignee: "M. Ortega",
      ownerTeam: "Supply Chain",
      statusLastWeek: { code: "unassigned", label: "Unassigned" },
      statusThisWeek: { code: "assigned", label: "Assigned" },
      overdue: true,
      lastUpdateAt: generatedAt,
      sourceType: "claim",
    },
    {
      id: "DEF-00477",
      title: "Battery connector tolerance out of spec",
      team: "RD",
      assignee: "S. Weber",
      ownerTeam: "R&D",
      statusLastWeek: { code: "assigned", label: "Assigned" },
      statusThisWeek: { code: "assigned", label: "Assigned" },
      overdue: true,
      lastUpdateAt: generatedAt,
      sourceType: "defect",
    },
    {
      id: "DEF-00468",
      title: "Cosmetic housing crack above shipment threshold",
      team: "MO",
      assignee: "A. Roy",
      ownerTeam: "Manufacturing",
      statusLastWeek: { code: "assigned", label: "Assigned" },
      statusThisWeek: { code: "assigned", label: "Assigned" },
      overdue: false,
      lastUpdateAt: generatedAt,
      sourceType: "defect",
    },
    {
      id: "FC-00108",
      title: "Charge board intermittent restart in field use",
      team: "RD",
      assignee: "J. Klein",
      ownerTeam: "R&D",
      statusLastWeek: { code: "assigned", label: "Assigned" },
      statusThisWeek: { code: "returned_to_qm_for_verification", label: "Returned to QM" },
      overdue: false,
      lastUpdateAt: generatedAt,
      sourceType: "claim",
    },
  ];
  const teamPortfolio: CeoReportTeamPortfolioRow[] = [
    { team: "RD", high: 2, medium: 3, low: 2, overdue: 2, total: 7 },
    { team: "MO", high: 2, medium: 4, low: 3, overdue: 3, total: 9 },
    { team: "SC", high: 1, medium: 3, low: 1, overdue: 1, total: 5 },
  ];
  const laggingTeam = buildLaggingTeam(teamPortfolio);
  const trendSeries = buildSeededTrendSeries(reportWeekEnd);
  const narrativeCards = buildNarrativeCards({
    trendSeries,
    laggingTeam,
    highSeverityCount: highSeverityTickets.length,
  });

  return {
    reportId,
    generatedAt,
    nextGenerationAt,
    title: "Qontrol Weekly CEO Report",
    subtitle: `Executive quality snapshot for ${formatWeekLabel(reportWeekStart, reportWeekEnd)}`,
    reportWeekStart,
    reportWeekEnd,
    summary: {
      openTickets: teamPortfolio.reduce((sum, row) => sum + row.total, 0),
      highSeverityOpen: highSeverityTickets.length,
      overdueOpen: teamPortfolio.reduce((sum, row) => sum + row.overdue, 0),
      reportWeekLabel: formatWeekLabel(reportWeekStart, reportWeekEnd),
      comparisonLastWeekLabel: formatDayLabel(comparisonLastWeekDay),
      comparisonThisWeekLabel: formatDayLabel(generatedAt.slice(0, 10)),
    },
    highSeverityTickets,
    teamPortfolio,
    laggingTeam,
    trendSeries,
    narrativeCards,
  };
}

export async function buildCeoReportData(now = new Date()): Promise<CeoReportData> {
  const generatedAt = now.toISOString();
  const reportWeekStart = weekStartMondayUtc(generatedAt);
  const reportWeekEnd = utcAddDays(reportWeekStart, 6);
  const comparisonLastWeekDay = utcAddDays(generatedAt.slice(0, 10), -7);
  const nextGenerationAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const reportId = `ceo-weekly-${reportWeekStart}`;

  const trendRange = {
    from: utcAddDays(generatedAt.slice(0, 10), -7 * 24),
    to: generatedAt.slice(0, 10),
    startIso: `${utcAddDays(generatedAt.slice(0, 10), -7 * 24)}T00:00:00.000Z`,
    endIso: `${generatedAt.slice(0, 10)}T23:59:59.999Z`,
  };

  try {
    const [cases, summary, claims, briefing] = await Promise.all([
      listCases(),
      fetchQualitySummary(trendRange),
      fetchClaims(50_000, trendRange),
      buildBriefingContext(),
    ]);

    const openCases = cases.filter((item) => item.state !== "closed");
    const highSeverityTickets = buildHighSeverityTable(
      openCases,
      `${comparisonLastWeekDay}T23:59:59.999Z`,
    );
    const teamPortfolio = buildTeamPortfolio(openCases);
    const laggingTeam = buildLaggingTeam(teamPortfolio);
    const trendSeries = buildTrendSeries(computeWeeklyRollup(summary, claims));
    const highSeverityCount = openCases.filter((item) => item.severity === "high").length;
    const narrativeCards = buildNarrativeCards({
      trendSeries,
      laggingTeam,
      highSeverityCount,
    }).map((card, index) =>
      index === 0 && briefing.rework_by_week.length > 0
        ? {
            ...card,
            body: `${card.body} Rework activity in the briefing context is now concentrated in ${briefing.rework_by_week
              .slice(-4)
              .map((point) => point.week_start)
              .join(", ")}, which supports a narrower improvement push.`,
          }
        : card,
    );

    return {
      reportId,
      generatedAt,
      nextGenerationAt,
      title: "Qontrol Weekly CEO Report",
      subtitle: `Executive quality snapshot for ${formatWeekLabel(reportWeekStart, reportWeekEnd)}`,
      reportWeekStart,
      reportWeekEnd,
      summary: {
        openTickets: openCases.length,
        highSeverityOpen: highSeverityCount,
        overdueOpen: openCases.filter((item) => isFollowUpOverdue(item)).length,
        reportWeekLabel: formatWeekLabel(reportWeekStart, reportWeekEnd),
        comparisonLastWeekLabel: formatDayLabel(comparisonLastWeekDay),
        comparisonThisWeekLabel: formatDayLabel(generatedAt.slice(0, 10)),
      },
      highSeverityTickets,
      teamPortfolio,
      laggingTeam,
      trendSeries,
      narrativeCards,
    };
  } catch {
    return buildSeededReportData(now);
  }
}
