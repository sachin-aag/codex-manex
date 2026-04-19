"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import {
  clarityLabel,
  responsibleTeamLabel,
  storyLabel,
  type CaseState,
  type EmailDraft,
  type QontrolCase,
  type Severity,
  type SimilarTicket,
  sourceTypeLabel,
} from "@/lib/qontrol-data";
import { StoryEvidenceView } from "@/components/story-evidence-view";

type CaseMap = Record<string, QontrolCase>;
type BoardFilters = {
  sourceTypes: QontrolCase["sourceType"][];
  stories: QontrolCase["story"][];
  defectTypes: string[];
  responsibleTeams: QontrolCase["responsibleTeam"][];
  clarities: QontrolCase["clarity"][];
};

type RouteDialogState = {
  sendEmail: boolean;
  relatedCaseIds: string[];
  selectedCaseIds: string[];
  completed?: boolean;
  githubUrl?: string;
  githubLabel?: string;
};

type CloseDialogState = {
  comment: string;
  completed?: boolean;
};

type AssignRouteResponse = {
  cases?: QontrolCase[];
  emailDraft?: EmailDraft;
  warning?: string;
  error?: string;
  details?: string;
};

const TOP_DEFECT_TYPE_COUNT = 5;
const OTHER_DEFECT_TYPE = "Other";
const UNCLASSIFIED_DEFECT_TYPE = "Unclassified";

const kanbanCategories: { key: CaseState; label: string }[] = [
  { key: "unassigned", label: "Unassigned" },
  { key: "assigned", label: "Assigned" },
  {
    key: "returned_to_qm_for_verification",
    label: "Returned to QM",
  },
];

const sourceTypeOrder: QontrolCase["sourceType"][] = ["defect", "claim"];
const storyOrder: QontrolCase["story"][] = ["supplier", "process", "design", "handling"];
const responsibleTeamOrder: QontrolCase["responsibleTeam"][] = ["RD", "MO", "SC"];
const clarityOrder: QontrolCase["clarity"][] = ["match", "warning", "needs clarification"];

function isRdBoardCase(caseItem: QontrolCase) {
  return caseItem.ownerTeam === "R&D";
}

function getMockToolName(caseItem: QontrolCase) {
  switch (caseItem.story) {
    case "supplier":
      return "Service Cloud";
    case "process":
      return "QMS CAPA";
    case "handling":
      return "QMS work order";
    default:
      return "team handoff tool";
  }
}

export function QontrolApp() {
  const searchParams = useSearchParams();
  const deepLinkApplied = useRef(false);
  const [cases, setCases] = useState<CaseMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<CaseState>("unassigned");
  const [filters, setFilters] = useState<BoardFilters>({
    sourceTypes: [],
    stories: [],
    defectTypes: [],
    responsibleTeams: [],
    clarities: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [routeDialog, setRouteDialog] = useState<RouteDialogState | null>(null);
  const [closeDialog, setCloseDialog] = useState<CloseDialogState | null>(null);
  const [showClosedTicketsDialog, setShowClosedTicketsDialog] = useState(false);

  const allCases = useMemo(() => Object.values(cases), [cases]);
  const topDefectTypes = useMemo(() => getTopDefectTypes(allCases), [allCases]);
  const filterContexts = useMemo(
    () => ({
      sourceTypes: getContextualCases(allCases, filters, topDefectTypes, "sourceTypes"),
      stories: getContextualCases(allCases, filters, topDefectTypes, "stories"),
      defectTypes: getContextualCases(allCases, filters, topDefectTypes, "defectTypes"),
      responsibleTeams: getContextualCases(
        allCases,
        filters,
        topDefectTypes,
        "responsibleTeams",
      ),
      clarities: getContextualCases(allCases, filters, topDefectTypes, "clarities"),
    }),
    [allCases, filters, topDefectTypes],
  );
  const filterOptions = useMemo(
    () => ({
      sourceTypes: getOrderedFilterOptions(
        sourceTypeOrder,
        filterContexts.sourceTypes,
        (item) => item.sourceType,
        filters.sourceTypes,
      ),
      stories: getOrderedFilterOptions(
        storyOrder,
        filterContexts.stories,
        (item) => item.story,
        filters.stories,
      ),
      defectTypes: mergeFilterOptions(
        getDefectTypeFilterOptions(filterContexts.defectTypes, topDefectTypes),
        filters.defectTypes,
      ),
      responsibleTeams: getOrderedFilterOptions(
        responsibleTeamOrder,
        filterContexts.responsibleTeams,
        (item) => item.responsibleTeam,
        filters.responsibleTeams,
      ),
      clarities: getOrderedFilterOptions(
        clarityOrder,
        filterContexts.clarities,
        (item) => item.clarity,
        filters.clarities,
      ),
    }),
    [filterContexts, filters, topDefectTypes],
  );
  const filteredCases = useMemo(
    () => allCases.filter((item) => matchesBoardFilters(item, filters, topDefectTypes)),
    [allCases, filters, topDefectTypes],
  );
  const orderedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => {
      const followUpDiff =
        Number(isFollowUpOverdue(b)) - Number(isFollowUpOverdue(a));
      if (followUpDiff !== 0) return followUpDiff;

      const severityDiff = severityRank[b.severity] - severityRank[a.severity];
      if (severityDiff !== 0) return severityDiff;

      return (
        new Date(a.nextFollowUpAt).getTime() - new Date(b.nextFollowUpAt).getTime()
      );
    });
  }, [filteredCases]);
  const selectedCase = selectedId ? cases[selectedId] : undefined;
  const selectedCaseNeedsFollowUp = selectedCase ? isFollowUpOverdue(selectedCase) : false;
  const usesGitHubBoard = selectedCase ? isRdBoardCase(selectedCase) : false;
  const mockToolName = selectedCase ? getMockToolName(selectedCase) : null;
  const routeableSimilarCases = useMemo(
    () => (selectedCase ? getRouteableSimilarCases(selectedCase, allCases) : []),
    [allCases, selectedCase],
  );
  const relatedRouteCount = routeableSimilarCases.length;
  const similarTickets = selectedCase?.similarTickets.slice(0, 3) ?? [];
  const usesComplaintSimilarity =
    selectedCase?.sourceType === "claim" && selectedCase.similarClaimIds.length > 0;
  const similarPanelTitle = usesComplaintSimilarity ? "Similar claims" : "Similar tickets";
  const similarPanelDescription = usesComplaintSimilarity
    ? "Top complaint-text matches pulled from other claim records."
    : "Operationally useful matches, not just semantic similarity.";
  const aiGeneratedLearning = selectedCase
    ? buildAiGeneratedLearning(similarTickets, selectedCase.defectType)
    : null;
  const githubDiscussionSummary = selectedCase?.external?.discussionSummary ?? null;
  const activeFilterCount = countActiveFilters(filters);
  const hasVisibleCases = orderedCases.length > 0;
  const showDetailPane = selectedId !== null;
  const recentClosedCases = useMemo(
    () =>
      [...allCases]
        .filter((item) => item.state === "closed")
        .sort(
          (a, b) =>
            new Date(b.lastUpdateAt).getTime() - new Date(a.lastUpdateAt).getTime(),
        )
        .slice(0, 12),
    [allCases],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCases(isBackgroundRefresh = false) {
      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
          setActionError(null);
        }
        const response = await fetch("/api/cases", { method: "GET" });
        if (!response.ok) {
          throw new Error(`Failed to load cases: ${response.status}`);
        }
        const payload = (await response.json()) as { cases: QontrolCase[] };
        if (cancelled) return;
        const nextMap = Object.fromEntries(
          payload.cases.map((item) => [item.id, item]),
        );
        setCases((current) => {
          const mergedMap: CaseMap = { ...nextMap };
          for (const [caseId, existing] of Object.entries(current)) {
            if (!mergedMap[caseId]) continue;
            const mergedTimeline = [
              ...mergedMap[caseId].timeline,
              ...existing.timeline.filter(
                (event) =>
                  !mergedMap[caseId].timeline.some((serverEvent) => serverEvent.id === event.id),
              ),
            ].sort(
              (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
            );
            const mergedLearnings = Array.from(
              new Set([...mergedMap[caseId].learnings, ...existing.learnings]),
            );
            mergedMap[caseId] = {
              ...mergedMap[caseId],
              emailDraft: existing.emailDraft,
              timeline: mergedTimeline,
              learnings: mergedLearnings,
              state:
                existing.clarity === "needs clarification" && existing.state === "unassigned"
                  ? existing.state
                  : mergedMap[caseId].state,
              clarity:
                existing.clarity === "needs clarification"
                  ? existing.clarity
                  : mergedMap[caseId].clarity,
            };
          }
          return mergedMap;
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load cases.";
        if (!isBackgroundRefresh) {
          setActionError(message);
        }
      } finally {
        if (!cancelled && !isBackgroundRefresh) setIsLoading(false);
      }
    }

    void loadCases();
    const intervalId = window.setInterval(() => {
      void loadCases(true);
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (deepLinkApplied.current) return;
    const cid = searchParams.get("case")?.trim();
    if (!cid || Object.keys(cases).length === 0) return;
    if (cases[cid]) {
      setSelectedId(cid);
      deepLinkApplied.current = true;
    }
  }, [cases, searchParams]);

  function updateCase(id: string, updater: (draft: QontrolCase) => QontrolCase) {
    setCases((current) => ({
      ...current,
      [id]: updater(current[id]),
    }));
  }

  async function mutateCase(
    caseId: string,
    action: "close",
    options?: { comment?: string },
  ) {
    setActionError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options ?? {}),
      });
      const payload = (await response.json()) as {
        case?: QontrolCase;
        error?: string;
        details?: string;
        warning?: string;
      };
      if (!response.ok || !payload.case) {
        throw new Error(payload.details ?? payload.error ?? "Mutation failed.");
      }
      setCases((current) => ({
        ...current,
        [payload.case!.id]: payload.case!,
      }));
      setActionError(payload.warning ?? null);
      return payload.case!;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update case.";
      setActionError(message);
      return null;
    } finally {
      setIsMutating(false);
    }
  }

  function handleApproveAndRoute() {
    if (!selectedCase) return;
    const relatedCaseIds = routeableSimilarCases.map((caseItem) => caseItem.id);
    setRouteDialog({
      sendEmail: true,
      relatedCaseIds,
      selectedCaseIds: [selectedCase.id, ...relatedCaseIds],
    });
  }

  async function confirmApproveAndRoute() {
    if (!selectedCase || !routeDialog) return;
    const createCombinedTicket = routeDialog.selectedCaseIds.length > 1;
    const linkedCaseIds = routeDialog.selectedCaseIds.filter((caseId) => caseId !== selectedCase.id);

    setActionError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/cases/${selectedCase.id}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          createCombinedTicket,
          linkedCaseIds: createCombinedTicket ? linkedCaseIds : [],
          openEmailDraft: routeDialog.sendEmail,
        }),
      });
      const payload = (await response.json()) as AssignRouteResponse;
      if (!response.ok || !payload.cases || payload.cases.length === 0) {
        throw new Error(payload.details ?? payload.error ?? "Route failed.");
      }
      const routedCase =
        payload.cases.find((caseItem) => caseItem.id === selectedCase.id) ?? payload.cases[0];

      setCases((current) => {
        const nextMap = { ...current };
        for (const updatedCase of payload.cases ?? []) {
          nextMap[updatedCase.id] =
            payload.emailDraft && updatedCase.id === selectedCase.id
              ? { ...updatedCase, emailDraft: payload.emailDraft }
              : updatedCase;
        }
        return nextMap;
      });
      setActionError(payload.warning ?? null);

      if (routeDialog.sendEmail && payload.emailDraft) {
        openMailDraft(payload.emailDraft);
        updateCase(selectedCase.id, (current) => ({
          ...current,
          emailDraft: payload.emailDraft ?? current.emailDraft,
          timeline: [
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              title: createCombinedTicket
                ? "Shared handoff email drafted"
                : "Assignment email drafted",
              description: `Prepared email draft for ${payload.emailDraft?.to.join(", ") ?? current.emailDraft.to.join(", ")}.`,
              source: "qm",
            },
            ...current.timeline,
          ],
        }));
      }

      setRouteDialog((current) =>
        current
          ? {
              ...current,
              completed: true,
              githubUrl: routedCase?.external?.url,
              githubLabel: routedCase?.external?.urlLabel ?? "Open GitHub issue",
            }
          : current,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update case.";
      setActionError(message);
    } finally {
      setIsMutating(false);
    }
  }

  function handleCombinedSelectionChange(checked: boolean) {
    if (!selectedCase) return;
    setRouteDialog((current) =>
      current
        ? {
            ...current,
            selectedCaseIds: checked
              ? [selectedCase.id, ...current.relatedCaseIds]
              : [selectedCase.id],
          }
        : current,
    );
  }

  function handleRouteChipToggle(caseId: string) {
    if (!selectedCase || caseId === selectedCase.id) return;

    setRouteDialog((current) => {
      if (!current) return current;
      const selected = new Set(current.selectedCaseIds);
      if (selected.has(caseId)) {
        selected.delete(caseId);
      } else {
        selected.add(caseId);
      }

      return {
        ...current,
        selectedCaseIds: [
          selectedCase.id,
          ...current.relatedCaseIds.filter((relatedCaseId) => selected.has(relatedCaseId)),
        ],
      };
    });
  }

  function handleSendEmail() {
    if (!selectedCase) return;
    const draft = selectedCase.emailDraft;
    const ticketUrl = `https://codexmanexqontrol.vercel.app/?case=${encodeURIComponent(selectedCase.id)}`;
    openMailDraft({ ...draft, body: `${draft.body}\n\nTicket: ${ticketUrl}` });
    updateCase(selectedCase.id, (current) => ({
      ...current,
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "Assignment email sent",
          description: `Team notification sent to ${current.emailDraft.to.join(", ")}.`,
          source: "qm",
        },
        ...current.timeline,
      ],
    }));
  }

  function handleSetupCall() {
    if (!selectedCase) return;
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const attendees = [
      ...selectedCase.emailDraft.to,
      ...selectedCase.emailDraft.cc,
    ];

    const ticketUrl = `https://codexmanexqontrol.vercel.app/?case=${encodeURIComponent(selectedCase.id)}`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Qontrol//EN",
      "BEGIN:VEVENT",
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:[${selectedCase.severity.toUpperCase()}] ${selectedCase.id} — Review call`,
      `DESCRIPTION:Case: ${selectedCase.id}\\nSeverity: ${selectedCase.severity.toUpperCase()}\\nTitle: ${selectedCase.title}\\n\\n${selectedCase.summary}\\n\\nTicket: ${ticketUrl}`,
      ...attendees.map((email) => `ATTENDEE;RSVP=TRUE:mailto:${email}`),
      `ORGANIZER:mailto:qm@manex.internal`,
      `STATUS:CONFIRMED`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedCase.id}-review-call.ics`;
    link.click();
    URL.revokeObjectURL(url);

    updateCase(selectedCase.id, (current) => ({
      ...current,
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "Review call scheduled",
          description: `Calendar invite created for ${start.toLocaleDateString()} 10:00 AM.`,
          source: "qm",
        },
        ...current.timeline,
      ],
    }));
  }

  function handleEscalate() {
    if (!selectedCase) return;
    const draft = selectedCase.escalationEmailDraft;
    const ticketUrl = `https://codexmanexqontrol.vercel.app/?case=${encodeURIComponent(selectedCase.id)}`;
    openMailDraft({ ...draft, body: `${draft.body}\n\nTicket: ${ticketUrl}` });
    updateCase(selectedCase.id, (current) => ({
      ...current,
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "Escalated to manager",
          description: `Escalation sent to ${current.escalationEmailDraft.to.join(", ")}.`,
          source: "qm",
        },
        ...current.timeline,
      ],
    }));
  }

  async function mutateGitHub(caseId: string, action: "connect" | "sync") {
    setActionError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/github/${action}`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        case?: QontrolCase;
        error?: string;
        details?: string;
      };
      if (!response.ok || !payload.case) {
        throw new Error(payload.details ?? payload.error ?? "GitHub sync failed.");
      }
      setCases((current) => ({
        ...current,
        [payload.case!.id]: payload.case!,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "GitHub sync failed.";
      setActionError(message);
    } finally {
      setIsMutating(false);
    }
  }

  async function backfillGitHubSummaries() {
    setActionError(null);
    setIsMutating(true);
    try {
      const response = await fetch("/api/github/backfill", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        cases?: QontrolCase[];
        error?: string;
        details?: string;
      };
      if (!response.ok || !payload.cases) {
        throw new Error(payload.details ?? payload.error ?? "GitHub backfill failed.");
      }

      const nextMap = Object.fromEntries(payload.cases.map((item) => [item.id, item]));
      setCases(nextMap);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "GitHub backfill failed.";
      setActionError(message);
    } finally {
      setIsMutating(false);
    }
  }

  function handleConnectBoard() {
    if (!selectedCase) return;
    void mutateGitHub(selectedCase.id, "connect");
  }

  function handleMockExternalTool() {
    if (!selectedCase || !mockToolName) return;
    updateCase(selectedCase.id, (current) => ({
      ...current,
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: `${mockToolName} handoff prepared`,
          description: `Mock ${mockToolName} action queued for ${current.ownerTeam} while GitHub remains the shared tracker.`,
          source: "qm",
        },
        ...current.timeline,
      ],
    }));
  }

  function handleSyncGitHub() {
    if (!selectedCase) return;
    void mutateGitHub(selectedCase.id, "sync");
  }

  function handleBackfillGitHubSummaries() {
    if (!selectedCase?.external?.issueNumber) return;
    void backfillGitHubSummaries();
  }

  function handleStartVerification() {
    if (!selectedCase) return;
    updateCase(selectedCase.id, (current) => ({
      ...current,
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "QM verification started",
          description: "QM began review and testing on the returned case.",
          source: "qm",
        },
        ...current.timeline,
      ],
    }));
  }

  function handleCloseCase() {
    if (!selectedCase) return;
    setCloseDialog({ comment: "" });
  }

  async function confirmCloseCase() {
    if (!selectedCase || !closeDialog) return;
    const updatedCase = await mutateCase(selectedCase.id, "close", {
      comment: closeDialog.comment.trim() || undefined,
    });
    if (!updatedCase) return;
    setCloseDialog((current) =>
      current
        ? {
            ...current,
            completed: true,
          }
        : current,
    );
  }

  function handleReroute() {
    if (!selectedCase) return;
    updateCase(selectedCase.id, (current) => ({
      ...current,
      state: "unassigned",
      clarity: "needs clarification",
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "QM rerouted after verification",
          description:
            "Current fix was not sufficient. Case returned to QM for revised routing.",
          source: "qm",
        },
        ...current.timeline,
      ],
      learnings: [
        ...current.learnings,
        "Initial corrective action reduced risk but did not fully resolve the case during QM verification.",
      ],
    }));
  }

  function handleEmailChange(value: string) {
    if (!selectedCase) return;
    updateCase(selectedCase.id, (current) => ({
      ...current,
      emailDraft: {
        ...current.emailDraft,
        body: value,
      },
    }));
  }

  function handleTicketSelect(caseId: string) {
    setCloseDialog(null);
    setShowClosedTicketsDialog(false);
    setRouteDialog(null);
    setSelectedId(caseId);
    setActionError(null);
    const ticketState = cases[caseId]?.state;
    const validCategory = kanbanCategories.some((c) => c.key === ticketState);
    setFocusedCategory(validCategory ? ticketState : "unassigned");
  }

  function toggleFilter<K extends keyof BoardFilters>(
    key: K,
    value: BoardFilters[K][number],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: toggleValue(current[key], value),
    }));
  }

  function clearFilters() {
    setFilters({
      sourceTypes: [],
      stories: [],
      defectTypes: [],
      responsibleTeams: [],
      clarities: [],
    });
  }

  function handleSimilarTicketSelect(caseId: string) {
    handleTicketSelect(caseId);

    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".unified-detail-card")
        ?.scrollTo({ top: 0, behavior: "smooth" });
      document
        .querySelector<HTMLElement>(".focused-layout")
        ?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const handleCloseDetails = useCallback(() => {
    setCloseDialog(null);
    setRouteDialog(null);
    setSelectedId(null);
    setActionError(null);
  }, []);

  function cycleFocusedCategory(direction: 1 | -1) {
    setFocusedCategory((prev) => {
      const idx = kanbanCategories.findIndex((c) => c.key === prev);
      return kanbanCategories[
        (idx + direction + kanbanCategories.length) % kanbanCategories.length
      ].key;
    });
  }

  useEffect(() => {
    if (!showDetailPane && !routeDialog && !showClosedTicketsDialog && !closeDialog) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (routeDialog) {
        setRouteDialog(null);
        return;
      }
      if (closeDialog) {
        if (!isMutating) setCloseDialog(null);
        return;
      }
      if (showClosedTicketsDialog) {
        setShowClosedTicketsDialog(false);
        return;
      }
      if (!showDetailPane) return;
      handleCloseDetails();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showDetailPane, handleCloseDetails, routeDialog, showClosedTicketsDialog, closeDialog, isMutating]);

  return (
    <main className="page-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-initial">Q</span>
            <span className="eyebrow-rest">ontrol</span>
          </p>
          <h1>Quality operations board</h1>
          <p className="hero-copy">
            Triage, route, follow up, and verify every case from one QM control
            surface.
          </p>
        </div>
        <div className="hero-stats">
          <MetricCard
            label="Open cases"
            value={countByState(orderedCases, "unassigned")}
            tooltip="Cases currently sitting in the Unassigned queue and awaiting QM action."
          />
          <MetricCard
            label="Needs follow-up"
            value={orderedCases.filter((c) => c.state !== "unassigned" && isFollowUpOverdue(c)).length}
            tooltip="Assigned or in-progress cases where the severity-based response window has elapsed without an update."
          />
          <MetricCard
            label="Returned to QM"
            value={countByState(orderedCases, "returned_to_qm_for_verification")}
            tooltip="Cases sent back by the owning team for QM verification before they can be closed."
          />
        </div>
      </section>

      {showDetailPane ? (
        <>
          <div
            aria-hidden="true"
            className="focused-overlay"
            onClick={handleCloseDetails}
          />
          <div className="focused-layout">
            <div className="focused-kanban">
              <div className="focused-kanban-nav">
                <button
                  aria-label="Previous category"
                  className="icon-close-button"
                  onClick={() => cycleFocusedCategory(-1)}
                  type="button"
                >
                  ←
                </button>
                <div className="focused-kanban-nav-center">
                  <h3>
                    {kanbanCategories.find((c) => c.key === focusedCategory)?.label}
                  </h3>
                  <span>
                    {orderedCases.filter((item) => item.state === focusedCategory).length}{" "}
                    cases
                  </span>
                </div>
                <button
                  aria-label="Next category"
                  className="icon-close-button"
                  onClick={() => cycleFocusedCategory(1)}
                  type="button"
                >
                  →
                </button>
              </div>
              <div className="focused-kanban-cards">
                {orderedCases
                  .filter((item) => item.state === focusedCategory)
                  .map((item) => (
                    <TicketCard
                      key={item.id}
                      item={item}
                      isSelected={selectedId === item.id}
                      onSelect={handleTicketSelect}
                    />
                  ))}
              </div>
            </div>

            <div className="focused-detail">
              {selectedCase ? (
                <div className="unified-detail-card">
                  <div className="panel-section detail-header">
                    <div className="detail-header-top">
                      <button
                        aria-label="Close details"
                        className="icon-close-button detail-close-inline"
                        onClick={handleCloseDetails}
                        type="button"
                      >
                        ×
                      </button>
                      <p className="detail-id">{selectedCase.id}</p>
                      <div className="header-actions">
                        {selectedCase.state === "unassigned" && selectedCase.clarity !== "warning" ? (
                          <button
                            className="primary-button"
                            disabled={isMutating}
                            onClick={handleApproveAndRoute}
                            type="button"
                          >
                            Approve and route
                          </button>
                        ) : null}
                        {selectedCase.state === "assigned" ? (
                          <button className="secondary-button" onClick={handleSendEmail} type="button">
                            Follow up
                          </button>
                        ) : null}
                        {selectedCase.state === "returned_to_qm_for_verification" ? (
                          <button className="secondary-button" onClick={handleStartVerification} type="button">
                            Start QM verification
                          </button>
                        ) : null}
                        {selectedCase.state === "returned_to_qm_for_verification" ? (
                          <button className="ghost-button" onClick={handleReroute} type="button">
                            Reroute
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="detail-badge-row">
                      <Badge tone={clarityTone(selectedCase.clarity)}>
                        {clarityLabel[selectedCase.clarity]}
                      </Badge>
                      <Badge tone="story">{storyLabel[selectedCase.story]}</Badge>
                      <span className={`severity-badge severity-${severityTone(selectedCase.severity)}`}>
                        {selectedCase.severity.charAt(0).toUpperCase() + selectedCase.severity.slice(1)}
                      </span>
                    </div>
                    <div className="detail-header-body">
                      <h2>{selectedCase.title}</h2>
                      <p className="detail-summary">{selectedCase.summary}</p>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-main">
                      {actionError ? (
                        <Panel unified title="Update error" description="Most recent backend error.">
                          <p>{actionError}</p>
                        </Panel>
                      ) : null}
                      <Panel unified title="Operational overview" description="Top priority signals for QM right now.">
                        <div className="overview-grid">
                          <MetricBlock label="Cost impact" value={formatCurrency(selectedCase.costUsd)} />
                          <MetricBlock label="Last update" value={timeSince(selectedCase.lastUpdateAt)} />
                          <MetricBlock
                            label="Follow-up needed"
                            value={selectedCaseNeedsFollowUp ? "Yes" : "No"}
                            tone={selectedCaseNeedsFollowUp ? "danger" : "neutral"}
                          />
                          {!selectedCaseNeedsFollowUp ? (
                            <MetricBlock
                              label="Next follow-up"
                              value={formatFollowUpDate(selectedCase.nextFollowUpAt)}
                            />
                          ) : null}
                        </div>
                        {githubDiscussionSummary ? (
                          <div className="operational-summary-card">
                            <div className="operational-summary-header">
                              <div className="operational-summary-label">
                                <AiGeneratedIcon />
                                <span>GitHub conversation summary</span>
                              </div>
                              <p className="operational-summary-meta">
                                {selectedCase.external?.discussionUpdatedAt ?? "Recently updated"}
                              </p>
                            </div>
                            <p className="operational-summary-copy">{githubDiscussionSummary}</p>
                          </div>
                        ) : null}
                      </Panel>

                      <Panel unified title="Triage signals" description="Fast context for priority, cohort size, and next move.">
                        <div className="overview-grid">
                          <MetricBlock
                            label="Matching cases"
                            value={String(selectedCase.triageContext.matchingCases)}
                          />
                          <MetricBlock
                            label="Open in same pattern"
                            value={String(selectedCase.triageContext.openMatchingCases)}
                          />
                          <MetricBlock
                            label="Queue priority"
                            value={selectedCase.triageContext.queuePriority}
                            tone={selectedCase.severity === "high" ? "danger" : "neutral"}
                          />
                          <MetricBlock
                            label="Next move"
                            value={selectedCase.triageContext.nextMove}
                          />
                        </div>
                        <p className="triage-signal-copy">{selectedCase.triageContext.timeSignal}</p>
                      </Panel>

                      <Panel unified title="Story match" description="Why Qontrol thinks this is the right pattern.">
                        <div className="match-grid">
                          <div>
                            <h4>Why this looks right</h4>
                            <ul className="bullet-list">
                              {selectedCase.routingWhy.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4>Still missing</h4>
                            <ul className="bullet-list">
                              {selectedCase.missingEvidence.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </Panel>

                      <Panel unified title="Evidence trail" description="Visual cause-and-effect path behind the recommendation.">
                        <StoryEvidenceView
                          visualization={selectedCase.visualization}
                          evidenceTrail={selectedCase.evidenceTrail}
                          traceability={selectedCase.traceability}
                        />
                      </Panel>

                      <Panel unified title={similarPanelTitle} description={similarPanelDescription}>
                        <div className="similar-grid">
                          {similarTickets.length > 0 ? (
                            <>
                              <div className="similar-table-wrap">
                                <table className="pf-table similar-table">
                                  <thead>
                                    <tr>
                                      <th>{usesComplaintSimilarity ? "Claim" : "Ticket"}</th>
                                      <th>Team</th>
                                      <th>Fixed by</th>
                                      <th>Time to fix</th>
                                      <th>Outcome</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {similarTickets.map((ticket) => (
                                      <tr key={ticket.id}>
                                        <td>
                                          <button
                                            className="similar-ticket-link"
                                            onClick={() => handleSimilarTicketSelect(ticket.id)}
                                            type="button"
                                          >
                                            <span className="similar-ticket-primary">{ticket.id}</span>
                                            <span className="similar-ticket-secondary">
                                              {usesComplaintSimilarity ? ticket.preview : ticket.title}
                                            </span>
                                          </button>
                                        </td>
                                        <td>{ticket.team}</td>
                                        <td>{ticket.fixedBy}</td>
                                        <td>{ticket.timeToFix}</td>
                                        <td>
                                          <Badge tone={outcomeTone(ticket.outcome)}>
                                            {formatOutcomeLabel(ticket.outcome)}
                                          </Badge>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="ai-learning-card">
                                <div className="ai-learning-header">
                                  <div className="ai-learning-label">
                                    <AiGeneratedIcon />
                                    <span>AI-generated learning</span>
                                  </div>
                                  <p className="ai-learning-subtitle">
                                    {usesComplaintSimilarity
                                      ? "Synthesized from closed similar claims."
                                      : "Synthesized from closed similar tickets."}
                                  </p>
                                </div>
                                <p className="ai-learning-copy">
                                  {aiGeneratedLearning ??
                                    (usesComplaintSimilarity
                                      ? "No closed similar claims yet. Once a comparable claim is resolved, Qontrol will synthesize the reusable learning here."
                                      : "No closed similar tickets yet. Once a comparable ticket is resolved, Qontrol will synthesize the reusable learning here.")}
                                </p>
                              </div>
                            </>
                          ) : (
                            <p className="story-visual-summary">
                              {usesComplaintSimilarity
                                ? "No complaint-text matches are available yet for this claim."
                                : "No close matches yet. As more routed cases accumulate, this panel will start surfacing reusable fixes and learnings."}
                            </p>
                          )}
                        </div>
                      </Panel>

                      {selectedCase.imageUrl ? (
                        <details className="email-collapse">
                          <summary className="email-collapse-toggle">Defect image</summary>
                          <div className="email-collapse-content">
                            <img
                              alt={`Image for ${selectedCase.id}`}
                              className="defect-image"
                              src={`/api/images?path=${encodeURIComponent(selectedCase.imageUrl)}`}
                            />
                          </div>
                        </details>
                      ) : null}

                      <Panel unified title="Timeline" description="Cross-system history and learnings trail.">
                        <div className="timeline">
                          {selectedCase.timeline.map((event) => (
                            <div className="timeline-item" key={event.id}>
                              <div className={`timeline-dot ${event.source}`} />
                              <div>
                                <div className="timeline-meta">
                                  <strong>{event.title}</strong>
                                  <span>{formatTimeline(event.at)}</span>
                                </div>
                                <p>{event.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Panel>
                    </div>

                    <div className="detail-side">
                      <Panel unified title="Proposed fix" description="Sent into the team board ticket and tracked back into QM.">
                        <div className="proposed-fix-preview">
                          <span
                            aria-label="AI-generated summary"
                            className="ai-generated-icon"
                            role="img"
                            title="AI-generated summary"
                          >
                            <svg
                              aria-hidden="true"
                              fill="none"
                              height="14"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                              width="14"
                            >
                              <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" />
                            </svg>
                          </span>
                          <p className="proposed-fix-preview-copy">
                            {getProposedFixSummary(selectedCase.proposedFix)}
                          </p>
                        </div>
                        <details className="proposed-fix-collapse">
                          <summary className="proposed-fix-toggle">See fix details</summary>
                          <div className="proposed-fix-body">
                            <div className="requested-action">
                              <div>
                                <h4>Containment</h4>
                                <p>{selectedCase.proposedFix.containment}</p>
                              </div>
                              <div>
                                <h4>Permanent fix</h4>
                                <p>{selectedCase.proposedFix.permanentFix}</p>
                              </div>
                              <div>
                                <h4>Validation ask</h4>
                                <p>{selectedCase.proposedFix.validation}</p>
                              </div>
                              <div>
                                <h4>Confidence</h4>
                                <p>{selectedCase.proposedFix.confidence}</p>
                              </div>
                              <div>
                                <h4>Owner confirmation</h4>
                                <p>{selectedCase.proposedFix.ownerConfirmation}</p>
                              </div>
                            </div>
                            <ul className="bullet-list compact top-gap">
                              {selectedCase.proposedFix.basis.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </details>
                      </Panel>

                      <Panel unified title="Routing" description="Who owns the current action and why.">
                        <div className="stack-list">
                          <SideRow label="QM owner" value={selectedCase.qmOwner} />
                          {selectedCase.csOwner ? (
                            <SideRow label="CS owner" value={selectedCase.csOwner} />
                          ) : null}
                          <SideRow label="Technical team" value={selectedCase.ownerTeam} />
                          {selectedCase.sourceType === "claim" ? (
                            <SideRow label="Market" value={selectedCase.market} />
                          ) : null}
                          <SideRow label="Product" value={`${selectedCase.articleId} / ${selectedCase.partNumber}`} />
                        </div>
                      </Panel>

                      <Panel unified title="Follow up now" description="Fast actions for the current case.">
                        <div className="action-stack">
                          <button className="secondary-button" onClick={handleSendEmail} type="button">
                            Send email
                          </button>
                          <button className="secondary-button" onClick={handleSetupCall} type="button">
                            Set up call
                          </button>
                          <button className="ghost-button" onClick={handleEscalate} type="button">
                            Escalate to manager
                          </button>
                        </div>
                      </Panel>

                      <details className="email-collapse">
                        <summary className="email-collapse-toggle">Assignment email draft</summary>
                        <div className="email-collapse-content">
                          <div className="email-meta">
                            <p><strong>To:</strong> {selectedCase.emailDraft.to.join(", ")}</p>
                            <p><strong>CC:</strong> {selectedCase.emailDraft.cc.join(", ")}</p>
                            <p><strong>Subject:</strong> {selectedCase.emailDraft.subject}</p>
                          </div>
                          <textarea
                            className="email-editor"
                            onChange={(event) => handleEmailChange(event.target.value)}
                            value={selectedCase.emailDraft.body}
                          />
                        </div>
                      </details>

                      <details className="email-collapse">
                        <summary className="email-collapse-toggle">
                          {usesGitHubBoard ? "External board" : "External handoff"}
                        </summary>
                        <div className="email-collapse-content">
                          <p className="email-meta">
                            {usesGitHubBoard
                              ? "GitHub issue + board sync for R&D ownership and inbound updates."
                              : "GitHub issue is shared on route; the downstream team tool stays mocked outside R&D."}
                          </p>
                          <div className="stack-list">
                            <SideRow label="System" value={selectedCase.external?.system ?? "GitHub"} />
                            <SideRow label="Ticket" value={selectedCase.external?.ticketId ?? "Not created"} />
                            <SideRow label="Status" value={selectedCase.external?.status ?? "Draft"} />
                            <SideRow label="Sync" value={selectedCase.external?.sync ?? "awaiting push"} />
                            <SideRow label="Last external update" value={selectedCase.external?.lastUpdate ?? "None"} />
                            <SideRow label="Repo" value={selectedCase.external?.repo ?? "Not configured"} />
                            <SideRow
                              label="Board"
                              value={
                                usesGitHubBoard
                                  ? selectedCase.external?.projectItemId
                                    ? "GitHub Project"
                                    : "Pending board sync"
                                  : "Skipped outside R&D"
                              }
                            />
                            <SideRow
                              label="Team tool"
                              value={usesGitHubBoard ? "GitHub" : mockToolName ?? "Mocked"}
                            />
                          </div>
                          {selectedCase.external?.url ? (
                            <a
                              className="secondary-button top-gap inline-action-link"
                              href={selectedCase.external.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {selectedCase.external.urlLabel}
                            </a>
                          ) : null}
                          <div className="action-stack top-gap">
                            {usesGitHubBoard ? (
                              <button
                                className="secondary-button"
                                disabled={isMutating}
                                onClick={handleConnectBoard}
                                type="button"
                              >
                                {selectedCase.external?.issueNumber ? "Update GitHub issue" : "Create GitHub issue"}
                              </button>
                            ) : (
                              <button
                                className="secondary-button"
                                disabled={isMutating || !selectedCase.external?.issueNumber}
                                onClick={handleMockExternalTool}
                                type="button"
                              >
                                {mockToolName ? `Mock ${mockToolName}` : "Mock external handoff"}
                              </button>
                            )}
                            <button
                              className="ghost-button"
                              disabled={isMutating || !selectedCase.external?.issueNumber}
                              onClick={handleSyncGitHub}
                              type="button"
                            >
                              Refresh GitHub sync
                            </button>
                            <button
                              className="ghost-button"
                              disabled={isMutating || !selectedCase.external?.issueNumber}
                              onClick={handleBackfillGitHubSummaries}
                              type="button"
                            >
                              Backfill all linked summaries
                            </button>
                          </div>
                        </div>
                      </details>

                      <Panel unified title="Learnings" description="Reusable notes captured during routing and closure.">
                        <ul className="bullet-list compact">
                          {selectedCase.learnings.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </Panel>
                    </div>
                  </div>

                  {selectedCase.state !== "closed" ? (
                    <div className="panel-section case-footer-actions">
                      <button
                        className="danger-button"
                        disabled={isMutating}
                        onClick={handleCloseCase}
                        type="button"
                      >
                        Close case
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="unified-detail-card">
                  <div className="panel-section">
                    <div className="panel-headerless-row">
                      <p>This ticket is no longer available.</p>
                      <button
                        aria-label="Close details"
                        className="icon-close-button"
                        onClick={handleCloseDetails}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {routeDialog && selectedCase ? (
        <>
          <div
            className="routing-modal-backdrop"
            onClick={() => {
              if (!isMutating) setRouteDialog(null);
            }}
          />
          <div className="routing-modal-shell">
            <div
              className="routing-modal-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="routing-modal-header">
                <div>
                  <p className="eyebrow">Routing choices</p>
                  <h3>Route {selectedCase.id}</h3>
                </div>
                <button
                  aria-label="Close routing choices"
                  className="icon-close-button"
                  disabled={isMutating}
                  onClick={() => setRouteDialog(null)}
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="routing-modal-body">
                {routeDialog.completed ? (
                  <div className="routing-success-card">
                    <div className="routing-success-header">
                      <span aria-hidden="true" className="routing-success-badge">
                        ✓
                      </span>
                      <div>
                        <strong>Routed to GitHub</strong>
                        <p className="routing-success-copy">
                          Engineers will work in GitHub. Qontrol stays in sync automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isMutating ? (
                  <div className="routing-modal-note">
                    <span aria-hidden="true" className="routing-loading-indicator">
                      <span className="routing-spinner" />
                      <span className="routing-loading-label">Whirring...</span>
                    </span>
                  </div>
                ) : null}
                {!routeDialog.completed && routeDialog.relatedCaseIds.length > 0 ? (
                  <>
                    <label className="routing-choice-card">
                      <input
                        checked={routeDialog.selectedCaseIds.length > 1}
                        onChange={(event) => handleCombinedSelectionChange(event.target.checked)}
                        type="checkbox"
                      />
                      <div>
                        <strong>
                          Found {routeDialog.relatedCaseIds.length} related open ticket
                          {routeDialog.relatedCaseIds.length === 1 ? "" : "s"}. Create one shared GitHub ticket?
                        </strong>
                        <p>
                          {routeDialog.selectedCaseIds.length > 1
                            ? `Qontrol will link ${routeDialog.selectedCaseIds.length} cases to one GitHub issue for ${selectedCase.ownerTeam}.`
                            : `Qontrol will route only ${selectedCase.id} to GitHub.`}
                        </p>
                      </div>
                    </label>
                    <div className="routing-chip-row">
                      {[selectedCase.id, ...routeDialog.relatedCaseIds].map((caseId) => {
                        const isSelected = routeDialog.selectedCaseIds.includes(caseId);
                        const isPrimary = caseId === selectedCase.id;

                        return (
                          <button
                            aria-pressed={isSelected}
                            className={`routing-chip ${isSelected ? "selected" : ""} ${isPrimary ? "routing-chip-primary" : ""}`}
                            disabled={isMutating}
                            key={caseId}
                            onClick={() => handleRouteChipToggle(caseId)}
                            type="button"
                          >
                            <span className={`routing-chip-check ${isSelected ? "visible" : ""}`}>
                              ✓
                            </span>
                            <span>{caseId}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : !routeDialog.completed ? (
                  <div className="routing-modal-note">
                    No additional related open tickets are available. Qontrol will create one GitHub
                    ticket for this case.
                  </div>
                ) : null}

                {!routeDialog.completed ? (
                  <label className="routing-choice-card">
                    <input
                      checked={routeDialog.sendEmail}
                      onChange={() =>
                        setRouteDialog((current) =>
                          current
                            ? {
                                ...current,
                                sendEmail: !current.sendEmail,
                              }
                            : current,
                        )
                      }
                      type="checkbox"
                    />
                    <div>
                      <strong>Also open a short handoff email draft?</strong>
                      <p>
                        The draft will include recipients, the downstream GitHub ticket link, and the
                        expected response back to QM.
                      </p>
                    </div>
                  </label>
                ) : null}
              </div>

              <div className="routing-modal-footer">
                <button
                  className="ghost-button"
                  disabled={isMutating}
                  onClick={() => setRouteDialog(null)}
                  type="button"
                >
                  {routeDialog.completed ? "Close" : "Cancel"}
                </button>
                {routeDialog.completed && routeDialog.githubUrl ? (
                  <a
                    className="primary-button inline-action-link"
                    href={routeDialog.githubUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {routeDialog.githubLabel ?? "Open GitHub issue"}
                  </a>
                ) : (
                  <button
                    className="primary-button"
                    disabled={isMutating}
                    onClick={confirmApproveAndRoute}
                    type="button"
                  >
                    {isMutating ? (
                      <span className="routing-button-content">
                        <span aria-hidden="true" className="routing-spinner routing-spinner-inverse" />
                        <span>
                          {routeDialog.sendEmail
                            ? "Routing and preparing email..."
                            : "Routing..."}
                        </span>
                      </span>
                    ) : (
                      "Route ticket"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showClosedTicketsDialog ? (
        <>
          <div
            className="routing-modal-backdrop"
            onClick={() => setShowClosedTicketsDialog(false)}
          />
          <div className="routing-modal-shell">
            <div
              className="routing-modal-card closed-tickets-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="routing-modal-header">
                <div>
                  <p className="eyebrow">Recently closed</p>
                  <h3>Closed tickets</h3>
                </div>
                <button
                  aria-label="Close recently closed tickets"
                  className="icon-close-button"
                  onClick={() => setShowClosedTicketsDialog(false)}
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="routing-modal-body">
                {recentClosedCases.length > 0 ? (
                  <div className="closed-ticket-list">
                    {recentClosedCases.map((caseItem) => (
                      <button
                        className="closed-ticket-row"
                        key={caseItem.id}
                        onClick={() => handleTicketSelect(caseItem.id)}
                        type="button"
                      >
                        <div className="closed-ticket-row-header">
                          <strong>{caseItem.id}</strong>
                          <span>{formatTimeline(caseItem.lastUpdateAt)}</span>
                        </div>
                        <p>{caseItem.title}</p>
                        <div className="closed-ticket-row-meta">
                          <span>{storyLabel[caseItem.story]}</span>
                          <span>{caseItem.ownerTeam}</span>
                          <span>{caseItem.severity}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="routing-modal-note">
                    No recently closed tickets yet.
                  </div>
                )}
              </div>

              <div className="routing-modal-footer">
                <button
                  className="ghost-button"
                  onClick={() => setShowClosedTicketsDialog(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {closeDialog && selectedCase ? (
        <>
          <div
            className="routing-modal-backdrop"
            onClick={() => {
              if (!isMutating) setCloseDialog(null);
            }}
          />
          <div className="routing-modal-shell">
            <div
              className="routing-modal-card close-case-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="routing-modal-header">
                <div>
                  <p className="eyebrow">Close case</p>
                  <h3>{closeDialog.completed ? `${selectedCase.id} closed` : `Close ${selectedCase.id}`}</h3>
                </div>
                <button
                  aria-label="Close close-case dialog"
                  className="icon-close-button"
                  disabled={isMutating}
                  onClick={() => setCloseDialog(null)}
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="routing-modal-body">
                {closeDialog.completed ? (
                  <div className="routing-success-card">
                    <div className="routing-success-header">
                      <span aria-hidden="true" className="routing-success-badge">
                        ✓
                      </span>
                      <div>
                        <strong>Case closed</strong>
                        <p className="routing-success-copy">
                          This ticket is now in the closed bucket and the closure note has been saved to
                          the Qontrol timeline.
                        </p>
                      </div>
                    </div>
                    {closeDialog.comment.trim() ? (
                      <p className="close-dialog-comment-preview">
                        <strong>Closure note:</strong> {closeDialog.comment.trim()}
                      </p>
                    ) : (
                      <p className="routing-success-meta">
                        Closed without an additional note.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {isMutating ? (
                      <div className="routing-modal-note">
                        <span aria-hidden="true" className="routing-loading-indicator">
                          <span className="routing-spinner" />
                          <span className="routing-loading-label">Wrapping up...</span>
                        </span>
                      </div>
                    ) : null}

                    <div className="routing-choice-card close-dialog-card">
                      <div className="close-dialog-copy">
                        <strong>Optional closure comment</strong>
                        <p>
                          Add a short note if you want the reason, validation, or follow-up captured in
                          the timeline.
                        </p>
                      </div>
                      <textarea
                        className="email-editor close-comment-editor"
                        disabled={isMutating}
                        onChange={(event) =>
                          setCloseDialog((current) =>
                            current
                              ? {
                                  ...current,
                                  comment: event.target.value,
                                }
                              : current,
                          )
                        }
                        placeholder="Closed after QM verification passed..."
                        value={closeDialog.comment}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="routing-modal-footer">
                <button
                  className="ghost-button"
                  disabled={isMutating}
                  onClick={() => setCloseDialog(null)}
                  type="button"
                >
                  {closeDialog.completed ? "Done" : "Cancel"}
                </button>
                {closeDialog.completed ? null : (
                  <button
                    className="danger-button"
                    disabled={isMutating}
                    onClick={confirmCloseCase}
                    type="button"
                  >
                    {isMutating ? (
                      <span className="routing-button-content">
                        <span aria-hidden="true" className="routing-spinner routing-spinner-inverse" />
                        <span>
                          {closeDialog.comment.trim() ? "Closing with comment..." : "Closing..."}
                        </span>
                      </span>
                    ) : closeDialog.comment.trim() ? (
                      "Close with comment"
                    ) : (
                      "Close case"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <section className={`workspace-grid ${showDetailPane ? "hidden" : "board-only"}`}>
        <div className="board-shell">
          <div className="board-toolbar">
            <div className="board-header">
              <div>
                <h2>Kanban</h2>
                <p>Cases are sorted by follow-up urgency first.</p>
              </div>
              <button
                className="ghost-button"
                onClick={() => setShowClosedTicketsDialog(true)}
                type="button"
              >
                View recently closed tickets
              </button>
            </div>
            <div className="board-filters">
              <div className="board-filters-header">
                <div>
                  <p className="board-filters-eyebrow">Board filters</p>
                  <p className="board-filters-copy">
                    Narrow the board by one or more labels.
                  </p>
                </div>
                <div className="board-filters-actions">
                  <span className="board-filters-summary">
                    {activeFilterCount > 0 ? `${activeFilterCount} active` : "All cases"}
                  </span>
                  <button
                    className="ghost-button"
                    disabled={activeFilterCount === 0}
                    onClick={clearFilters}
                    type="button"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              <div className="board-filter-row">
                <DropdownFilter
                  label="Defect / claim"
                  summary={getFilterSummary(filters.sourceTypes, sourceTypeLabel)}
                >
                  {filterOptions.sourceTypes.map((value) => (
                    <DropdownOption
                      key={value}
                      isActive={filters.sourceTypes.includes(value)}
                      onClick={() => toggleFilter("sourceTypes", value)}
                    >
                      {sourceTypeLabel[value]}
                    </DropdownOption>
                  ))}
                </DropdownFilter>
                <DropdownFilter
                  label="Responsible team"
                  summary={getFilterSummary(filters.responsibleTeams, responsibleTeamLabel)}
                >
                  {filterOptions.responsibleTeams.map((value) => (
                    <DropdownOption
                      key={value}
                      isActive={filters.responsibleTeams.includes(value)}
                      onClick={() => toggleFilter("responsibleTeams", value)}
                    >
                      {responsibleTeamLabel[value]}
                    </DropdownOption>
                  ))}
                </DropdownFilter>
                <DropdownFilter
                  label="Story type"
                  summary={getFilterSummary(filters.stories, storyLabel)}
                >
                  {filterOptions.stories.map((value) => (
                    <DropdownOption
                      key={value}
                      isActive={filters.stories.includes(value)}
                      onClick={() => toggleFilter("stories", value)}
                    >
                      {storyLabel[value]}
                    </DropdownOption>
                  ))}
                </DropdownFilter>
                <DropdownFilter
                  label="Clarity"
                  summary={getFilterSummary(filters.clarities, clarityLabel)}
                >
                  {filterOptions.clarities.map((value) => (
                    <DropdownOption
                      key={value}
                      isActive={filters.clarities.includes(value)}
                      onClick={() => toggleFilter("clarities", value)}
                    >
                      {clarityLabel[value]}
                    </DropdownOption>
                  ))}
                </DropdownFilter>
                <DropdownFilter
                  label="Defect type"
                  summary={getFilterSummary(filters.defectTypes)}
                >
                  {filterOptions.defectTypes.map((value) => (
                    <DropdownOption
                      key={value}
                      isActive={filters.defectTypes.includes(value)}
                      onClick={() => toggleFilter("defectTypes", value)}
                    >
                      {value}
                    </DropdownOption>
                  ))}
                </DropdownFilter>
              </div>
            </div>
          </div>
          {isLoading ? <p className="board-status">Loading cases...</p> : null}
          {!isLoading && !hasVisibleCases ? (
            <p className="board-status">
              {allCases.length === 0
                ? "No cases found. Check API credentials and available data."
                : "No cases match the current filters."}
            </p>
          ) : null}
          <div className="board-grid">
            {kanbanCategories.map((column) => {
              const columnCases = orderedCases.filter(
                (item) => item.state === column.key,
              );

              return (
                <div className="board-column" key={column.key}>
                  <div className="column-header">
                    <div>
                      <h3>{column.label}</h3>
                      <span>{columnCases.length} cases</span>
                    </div>
                  </div>
                  <div className="column-cards">
                    {columnCases.map((item) => (
                      <TicketCard
                        key={item.id}
                        item={item}
                        isSelected={selectedId === item.id}
                        onSelect={handleTicketSelect}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

function Panel({
  title,
  description,
  children,
  unified = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  unified?: boolean;
}) {
  return (
    <section className={unified ? "panel-section panel" : "card-surface panel"}>
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DropdownFilter({
  label,
  summary,
  children,
}: {
  label: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="filter-dropdown">
      <summary className="filter-dropdown-trigger">
        <span className="filter-dropdown-copy">
          <span className="filter-dropdown-label">{label}</span>
          <span className="filter-dropdown-value">{summary}</span>
        </span>
        <span aria-hidden="true" className="filter-dropdown-chevron">
          ▾
        </span>
      </summary>
      <div className="filter-dropdown-menu">{children}</div>
    </details>
  );
}

function DropdownOption({
  children,
  isActive,
  onClick,
}: {
  children: ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={`filter-option ${isActive ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="filter-option-check" aria-hidden="true">
        {isActive ? "✓" : ""}
      </span>
      <span className="filter-option-text">{children}</span>
    </button>
  );
}

function TicketCard({
  item,
  isSelected,
  onSelect,
}: {
  item: QontrolCase;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={`ticket-card ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(item.id)}
      type="button"
    >
      {isFollowUpOverdue(item) || isFollowUpSoon(item) ? (
        <span
          aria-label={
            isFollowUpOverdue(item)
              ? "Needs attention"
              : "Needs attention soon"
          }
          className={`attention-indicator ${
            isFollowUpOverdue(item) ? "overdue" : "soon"
          }`}
          role="img"
          title={
            isFollowUpOverdue(item)
              ? "Needs attention"
              : "Needs attention soon"
          }
        >
          !
        </span>
      ) : item.state === "closed" ? (
        <span
          className="attention-indicator on-track"
          title="Resolved"
        >
          ✓
        </span>
      ) : item.state !== "unassigned" ? (
        <span className="attention-indicator updated-label">
          {timeSince(item.lastUpdateAt)}
        </span>
      ) : null}
      <div className="ticket-topline">
        <span className="ticket-title">{item.title}</span>
      </div>
      <div className="ticket-badges">
        <Badge tone="neutral">{item.sourceType}</Badge>
        <Badge tone={clarityTone(item.clarity)}>
          {clarityLabel[item.clarity]}
        </Badge>
        <Badge tone="story">{storyLabel[item.story]}</Badge>
      </div>
      <div className="ticket-meta-grid">
        <MetaStat label="Team" value={item.ownerTeam} />
        <MetaStat label="Severity" value={item.severity} />
        <MetaStat label="Cost" value={formatCurrency(item.costUsd)} />
        <MetaStat
          label="Updated"
          value={timeSince(item.lastUpdateAt)}
        />
      </div>
      <div className="ticket-footer">
        <span>{item.assignee}</span>
        <span>{formatFollowUpDate(item.nextFollowUpAt)}</span>
      </div>
    </button>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone:
    | "neutral"
    | "story"
    | "success"
    | "warning"
    | "danger"
    | "teal";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number;
  tooltip?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="metric-card">
      <div className="metric-card-header">
        <span className="metric-card-label">{label}</span>
        {tooltip ? (
          <button
            aria-label={`Info about ${label}`}
            className="kpi-info-btn"
            onBlur={() => setShowTip(false)}
            onClick={() => setShowTip((v) => !v)}
            type="button"
          >
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="16" y2="12" />
              <line x1="12" x2="12.01" y1="8" y2="8" />
            </svg>
            {showTip ? <span className="kpi-tooltip">{tooltip}</span> : null}
          </button>
        ) : null}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className={`metric-block metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="side-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AiGeneratedIcon() {
  return (
    <span aria-hidden="true" className="ai-learning-icon">
      <svg
        fill="none"
        height="16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="16"
      >
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
      </svg>
    </span>
  );
}

const severityRank: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Severity-based response windows in milliseconds. */
const severityWindowMs: Record<Severity, number> = {
  high: 1000 * 60 * 60 * 24,       // 24 hours
  medium: 1000 * 60 * 60 * 48,     // 48 hours
  low: 1000 * 60 * 60 * 24 * 5,    // 5 business days
};

/** How much of the window must elapse before we show a "soon" warning (75%). */
const SOON_THRESHOLD = 0.75;

/**
 * Returns whether a case needs urgent attention (exclamation).
 * - Unassigned cases always need attention.
 * - Assigned / in-progress cases need attention only when the time since
 *   lastUpdateAt exceeds the severity-based response window.
 * - Closed cases never need attention.
 */
function isFollowUpOverdue(item: QontrolCase) {
  if (item.state === "closed") return false;
  if (item.state === "unassigned") return true;
  const elapsed = Date.now() - new Date(item.lastUpdateAt).getTime();
  return elapsed >= severityWindowMs[item.severity];
}

/**
 * Returns whether a case is approaching its response window (>75% elapsed).
 * Only applies to non-closed, non-unassigned cases.
 */
function isFollowUpSoon(item: QontrolCase) {
  if (item.state === "closed" || item.state === "unassigned") return false;
  const elapsed = Date.now() - new Date(item.lastUpdateAt).getTime();
  const window = severityWindowMs[item.severity];
  return elapsed >= window * SOON_THRESHOLD && elapsed < window;
}

function followStatusClass(item: QontrolCase) {
  if (isFollowUpOverdue(item)) return "danger";
  if (isFollowUpSoon(item)) return "warning";
  return "neutral";
}

function countByState(items: QontrolCase[], state: CaseState) {
  return items.filter((item) => item.state === state).length;
}

function toggleValue<T extends string>(current: T[], value: T) {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

function countActiveFilters(filters: BoardFilters) {
  return (
    filters.sourceTypes.length +
    filters.stories.length +
    filters.defectTypes.length +
    filters.responsibleTeams.length +
    filters.clarities.length
  );
}

function getFilterSummary<T extends string>(
  selected: T[],
  labelMap?: Record<T, string>,
) {
  if (selected.length === 0) return "All";
  if (selected.length === 1) {
    const value = selected[0];
    return labelMap?.[value] ?? value;
  }
  return `${selected.length} selected`;
}

function matchesBoardFilters(
  item: QontrolCase,
  filters: BoardFilters,
  topDefectTypes: string[],
  ignoredKey?: keyof BoardFilters,
) {
  if (
    ignoredKey !== "sourceTypes" &&
    filters.sourceTypes.length > 0 &&
    !filters.sourceTypes.includes(item.sourceType)
  ) {
    return false;
  }
  if (
    ignoredKey !== "stories" &&
    filters.stories.length > 0 &&
    !filters.stories.includes(item.story)
  ) {
    return false;
  }
  if (
    ignoredKey !== "defectTypes" &&
    filters.defectTypes.length > 0 &&
    !matchesDefectTypeFilter(item.defectType, filters.defectTypes, topDefectTypes)
  ) {
    return false;
  }
  if (
    ignoredKey !== "responsibleTeams" &&
    filters.responsibleTeams.length > 0 &&
    !filters.responsibleTeams.includes(item.responsibleTeam)
  ) {
    return false;
  }
  if (
    ignoredKey !== "clarities" &&
    filters.clarities.length > 0 &&
    !filters.clarities.includes(item.clarity)
  ) {
    return false;
  }
  return true;
}

function getContextualCases(
  items: QontrolCase[],
  filters: BoardFilters,
  topDefectTypes: string[],
  ignoredKey: keyof BoardFilters,
) {
  return items.filter((item) => matchesBoardFilters(item, filters, topDefectTypes, ignoredKey));
}

function getOrderedFilterOptions<T extends string>(
  orderedValues: T[],
  items: QontrolCase[],
  getValue: (item: QontrolCase) => T,
  selected: T[],
) {
  const selectedSet = new Set(selected);
  return orderedValues.filter(
    (value) => selectedSet.has(value) || items.some((item) => getValue(item) === value),
  );
}

function mergeFilterOptions<T extends string>(options: T[], selected: T[]) {
  return [...options, ...selected.filter((value) => !options.includes(value))];
}

function getTopDefectTypes(items: QontrolCase[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.defectType === UNCLASSIFIED_DEFECT_TYPE) continue;
    counts.set(item.defectType, (counts.get(item.defectType) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, TOP_DEFECT_TYPE_COUNT)
    .map(([value]) => value);
}

function getDefectTypeFilterOptions(items: QontrolCase[], topDefectTypes: string[]) {
  const allClassified = new Set(
    items
      .map((item) => item.defectType)
      .filter((value) => value !== UNCLASSIFIED_DEFECT_TYPE),
  );
  const hasOther = Array.from(allClassified).some((value) => !topDefectTypes.includes(value));
  const hasUnclassified = items.some((item) => item.defectType === UNCLASSIFIED_DEFECT_TYPE);

  return [
    ...topDefectTypes,
    ...(hasOther ? [OTHER_DEFECT_TYPE] : []),
    ...(hasUnclassified ? [UNCLASSIFIED_DEFECT_TYPE] : []),
  ];
}

function matchesDefectTypeFilter(
  defectType: string,
  selectedDefectTypes: string[],
  topDefectTypes: string[],
) {
  if (selectedDefectTypes.includes(defectType)) return true;
  if (
    selectedDefectTypes.includes(OTHER_DEFECT_TYPE) &&
    (defectType === UNCLASSIFIED_DEFECT_TYPE || !topDefectTypes.includes(defectType))
  ) {
    return true;
  }
  return false;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function timeSince(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d ago`;
  const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  return `${diffHours}h ago`;
}

function formatFollowUpDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTimeline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function clarityTone(clarity: QontrolCase["clarity"]) {
  if (clarity === "match") return "danger";
  if (clarity === "warning") return "warning";
  return "neutral";
}

function severityTone(severity: Severity) {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "success";
}

function outcomeTone(outcome: SimilarTicket["outcome"]) {
  if (outcome === "worked") return "success";
  return "warning";
}

function formatOutcomeLabel(outcome: SimilarTicket["outcome"]) {
  if (outcome === "worked") return "Worked";
  return "Open";
}

function getRouteableSimilarCases(selectedCase: QontrolCase, allCases: QontrolCase[]) {
  return allCases.filter((candidate) => {
    if (candidate.id === selectedCase.id) return false;
    if (candidate.state === "closed") return false;
    if (!selectedCase.similarityKey || candidate.similarityKey !== selectedCase.similarityKey) {
      return false;
    }
    if (candidate.ownerTeam !== selectedCase.ownerTeam) return false;

    const selectedIssueNumber = selectedCase.external?.issueNumber;
    const candidateIssueNumber = candidate.external?.issueNumber;
    if (candidateIssueNumber == null) return true;
    if (selectedIssueNumber == null) return false;
    return candidateIssueNumber === selectedIssueNumber;
  });
}

function openMailDraft(draft: EmailDraft) {
  const mailto =
    `mailto:${draft.to.join(",")}` +
    `?cc=${encodeURIComponent(draft.cc.join(","))}` +
    `&subject=${encodeURIComponent(draft.subject)}` +
    `&body=${encodeURIComponent(draft.body)}`;

  window.location.href = mailto;
}

function buildAiGeneratedLearning(
  tickets: SimilarTicket[],
  defectType: QontrolCase["defectType"],
) {
  const closedTickets = tickets.filter((ticket) => ticket.outcome === "worked");
  if (closedTickets.length === 0) return null;

  const topAction =
    mostCommon(closedTickets.map((ticket) => ticket.actionTaken)) || "reuse the same corrective path";
  const topFixer = mostCommon(
    closedTickets
      .map((ticket) => ticket.fixedBy)
      .filter((value) => value && value !== "-"),
  );
  const resolutionDays = closedTickets
    .map((ticket) => ticket.resolutionDays)
    .filter((value): value is number => value != null);
  const averageDays =
    resolutionDays.length > 0
      ? Math.round(
          resolutionDays.reduce((total, value) => total + value, 0) / resolutionDays.length,
        )
      : null;
  const firstLearning = closedTickets[0]?.learning;

  return [
    `Across closed ${defectType} tickets, the most reusable corrective action was ${topAction === "reuse the same corrective path" ? topAction : `"${topAction}"`}.`,
    topFixer
      ? `${topFixer} closed the matching tickets${averageDays ? ` in about ${averageDays} day${averageDays === 1 ? "" : "s"}` : ""}.`
      : averageDays
        ? `Comparable tickets were resolved in about ${averageDays} day${averageDays === 1 ? "" : "s"}.`
        : null,
    firstLearning ? `Common learning: ${firstLearning}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let winner = "";
  let max = 0;
  for (const [value, count] of counts) {
    if (count > max) {
      winner = value;
      max = count;
    }
  }

  return winner;
}

function getProposedFixSummary(proposedFix: QontrolCase["proposedFix"]) {
  return `${proposedFix.containment} Then ${proposedFix.permanentFix}`.replace(/\s+/g, " ").trim();
}
