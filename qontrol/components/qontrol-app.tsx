"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  clarityLabel,
  storyLabel,
  type CaseState,
  type QontrolCase,
  type Severity,
  type SimilarTicket,
} from "@/lib/qontrol-data";

type CaseMap = Record<string, QontrolCase>;
const MIN_BOARD_WIDTH_PERCENT = 35;
const MAX_BOARD_WIDTH_PERCENT = 72;

const boardColumns: { key: CaseState; label: string }[] = [
  { key: "unassigned", label: "Unassigned" },
  { key: "assigned", label: "Assigned" },
  {
    key: "returned_to_qm_for_verification",
    label: "Returned to QM",
  },
  { key: "closed", label: "Closed" },
];

export function QontrolApp() {
  const [cases, setCases] = useState<CaseMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardWidthPercent, setBoardWidthPercent] = useState(52);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);

  const orderedCases = useMemo(() => {
    return Object.values(cases).sort((a, b) => {
      const followUpDiff =
        Number(isFollowUpOverdue(b)) - Number(isFollowUpOverdue(a));
      if (followUpDiff !== 0) return followUpDiff;

      const severityDiff = severityRank[b.severity] - severityRank[a.severity];
      if (severityDiff !== 0) return severityDiff;

      return (
        new Date(a.nextFollowUpAt).getTime() - new Date(b.nextFollowUpAt).getTime()
      );
    });
  }, [cases]);
  const selectedCase = selectedId ? cases[selectedId] : undefined;
  const showDetailPane = selectedId !== null;
  const workspaceStyle = showDetailPane
    ? ({
        "--board-width": `${boardWidthPercent}%`,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    let cancelled = false;

    async function loadCases() {
      try {
        setIsLoading(true);
        setActionError(null);
        const response = await fetch("/api/cases", { method: "GET" });
        if (!response.ok) {
          throw new Error(`Failed to load cases: ${response.status}`);
        }
        const payload = (await response.json()) as { cases: QontrolCase[] };
        if (cancelled) return;
        const nextMap = Object.fromEntries(
          payload.cases.map((item) => [item.id, item]),
        );
        setCases(nextMap);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load cases.";
        setActionError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadCases();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateCase(id: string, updater: (draft: QontrolCase) => QontrolCase) {
    setCases((current) => ({
      ...current,
      [id]: updater(current[id]),
    }));
  }

  async function mutateCase(caseId: string, action: "assign" | "close") {
    setActionError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/${action}`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        case?: QontrolCase;
        error?: string;
        details?: string;
      };
      if (!response.ok || !payload.case) {
        throw new Error(payload.details ?? payload.error ?? "Mutation failed.");
      }
      setCases((current) => ({
        ...current,
        [payload.case!.id]: payload.case!,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update case.";
      setActionError(message);
    } finally {
      setIsMutating(false);
    }
  }

  function handleApproveAndRoute() {
    if (!selectedCase) return;
    void mutateCase(selectedCase.id, "assign");
  }

  function handleSendEmail() {
    if (!selectedCase) return;
    const draft = selectedCase.emailDraft;
    const ticketUrl = `https://codexmanexqontrol.vercel.app/?case=${encodeURIComponent(selectedCase.id)}`;
    const bodyWithLink = `${draft.body}\n\nTicket: ${ticketUrl}`;
    const mailto =
      `mailto:${draft.to.join(",")}` +
      `?cc=${encodeURIComponent(draft.cc.join(","))}` +
      `&subject=${encodeURIComponent(draft.subject)}` +
      `&body=${encodeURIComponent(bodyWithLink)}`;
    window.open(mailto, "_blank");
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
    const bodyWithLink = `${draft.body}\n\nTicket: ${ticketUrl}`;
    const mailto =
      `mailto:${draft.to.join(",")}` +
      `?cc=${encodeURIComponent(draft.cc.join(","))}` +
      `&subject=${encodeURIComponent(draft.subject)}` +
      `&body=${encodeURIComponent(bodyWithLink)}`;
    window.open(mailto, "_blank");
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

  function handleCreateMockTicket() {
    if (!selectedCase) return;
    updateCase(selectedCase.id, (current) => ({
      ...current,
      external: current.external
        ? {
            ...current.external,
            status: current.state === "assigned" ? "In Progress" : "Draft created",
            lastUpdate: formatShortNow(),
            sync: "synced",
          }
        : {
            system: "Jira",
            ticketId: `${current.story.slice(0, 2).toUpperCase()}-${Math.floor(
              Math.random() * 1000,
            )}`,
            urlLabel: "Open mock Jira ticket",
            status: "Draft created",
            assignee: current.assignee,
            lastUpdate: formatShortNow(),
            sync: "synced",
          },
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "Mock external ticket created",
          description: "Outbound handoff created in the external team system.",
          source: "system",
        },
        ...current.timeline,
      ],
    }));
  }

  function handleMockInboundUpdate() {
    if (!selectedCase) return;
    updateCase(selectedCase.id, (current) => ({
      ...current,
      lastUpdateAt: new Date().toISOString(),
      external: current.external
        ? {
            ...current.external,
            status: "Ready for QM verification",
            lastUpdate: formatShortNow(),
            sync: "synced",
          }
        : undefined,
      state: "returned_to_qm_for_verification",
      timeline: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          title: "Inbound Jira update synced",
          description:
            "External team marked the case ready for QM verification.",
          source: "team",
        },
        ...current.timeline,
      ],
    }));
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
    void mutateCase(selectedCase.id, "close");
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
    setSelectedId(caseId);
    setActionError(null);
  }

  function handleCloseDetails() {
    setSelectedId(null);
    setActionError(null);
  }

  function handleResizerPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!showDetailPane) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;

    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    const updateFromPointer = (clientX: number) => {
      const nextPercent = ((clientX - rect.left) / rect.width) * 100;
      setBoardWidthPercent(
        clamp(nextPercent, MIN_BOARD_WIDTH_PERCENT, MAX_BOARD_WIDTH_PERCENT),
      );
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      updateFromPointer(pointerEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleResizerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -3 : 3;
    setBoardWidthPercent((current) =>
      clamp(current + delta, MIN_BOARD_WIDTH_PERCENT, MAX_BOARD_WIDTH_PERCENT),
    );
  }

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
          <MetricCard label="Open cases" value={countByState(orderedCases, "unassigned") + countByState(orderedCases, "assigned")} />
          <MetricCard
            label="Needs follow-up now"
            value={orderedCases.filter(isFollowUpOverdue).length}
          />
          <MetricCard
            label="Returned to QM"
            value={countByState(orderedCases, "returned_to_qm_for_verification")}
          />
        </div>
      </section>

      <section
        className={`workspace-grid ${showDetailPane ? "with-detail" : "board-only"}`}
        ref={workspaceRef}
        style={workspaceStyle}
      >
        <div className="board-shell">
          <div className="board-header">
            <div>
              <h2>Kanban</h2>
              <p>Cases are sorted by follow-up urgency first.</p>
            </div>
          </div>
          {isLoading ? <p className="board-status">Loading cases...</p> : null}
          {!isLoading && orderedCases.length === 0 ? (
            <p className="board-status">No cases found. Check API credentials and available data.</p>
          ) : null}
          <div className="board-grid">
            {boardColumns.map((column) => {
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
                      <button
                        className={`ticket-card ${selectedId === item.id ? "selected" : ""}`}
                        key={item.id}
                        onClick={() => handleTicketSelect(item.id)}
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showDetailPane ? (
          <>
            <button
              aria-label="Resize board and ticket details"
              aria-valuemax={MAX_BOARD_WIDTH_PERCENT}
              aria-valuemin={MIN_BOARD_WIDTH_PERCENT}
              aria-valuenow={Math.round(boardWidthPercent)}
              className="workspace-resizer"
              onKeyDown={handleResizerKeyDown}
              onPointerDown={handleResizerPointerDown}
              type="button"
            />
            <div className="detail-shell">
              {selectedCase ? (
            <>
          <section className="detail-header card-surface">
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
          </section>

          <section className="detail-grid">
            <div className="detail-main">
              {actionError ? (
                <Panel title="Update error" description="Most recent backend error.">
                  <p>{actionError}</p>
                </Panel>
              ) : null}
              <Panel title="Operational overview" description="Top priority signals for QM right now.">
                <div className="overview-grid">
                  <MetricBlock label="Cost impact" value={formatCurrency(selectedCase.costUsd)} />
                  <MetricBlock label="Last update" value={timeSince(selectedCase.lastUpdateAt)} />
                  <MetricBlock
                    label="Follow-up needed"
                    value={isFollowUpOverdue(selectedCase) ? "Yes" : "No"}
                    tone={isFollowUpOverdue(selectedCase) ? "danger" : "neutral"}
                  />
                  <MetricBlock
                    label="Next follow-up"
                    value={formatFollowUpDate(selectedCase.nextFollowUpAt)}
                  />
                </div>
              </Panel>

              <Panel title="Story match" description="Why Qontrol thinks this is the right pattern.">
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

              <Panel title="Evidence trail" description="Structured facts that support the recommendation.">
                <ul className="bullet-list">
                  {selectedCase.evidenceTrail.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Similar tickets" description="Operationally useful matches, not just semantic similarity.">
                <div className="similar-grid">
                  {selectedCase.similarTickets.map((ticket) => (
                    <div className="similar-card" key={ticket.id}>
                      <div className="similar-card-header">
                        <div>
                          <p className="detail-id">{ticket.id}</p>
                          <h4>{ticket.title}</h4>
                        </div>
                        <Badge tone={outcomeTone(ticket.outcome)}>{ticket.outcome}</Badge>
                      </div>
                      <div className="similar-meta">
                        <span>{storyLabel[ticket.story]}</span>
                        <span>{ticket.team}</span>
                        <span>{ticket.timeToFix}</span>
                      </div>
                      <p className="similar-copy">
                        <strong>Action:</strong> {ticket.actionTaken}
                      </p>
                      <p className="similar-copy">
                        <strong>Learning:</strong> {ticket.learning}
                      </p>
                    </div>
                  ))}
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

              <Panel title="Timeline" description="Cross-system history and learnings trail.">
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
              <Panel title="Routing" description="Who owns the current action and why.">
                <div className="stack-list">
                  <SideRow label="QM owner" value={selectedCase.qmOwner} />
                  {selectedCase.csOwner ? (
                    <SideRow label="CS owner" value={selectedCase.csOwner} />
                  ) : null}
                  <SideRow label="Technical team" value={selectedCase.ownerTeam} />
                  <SideRow label="Assignee" value={selectedCase.assignee} />
                  <SideRow label="Market" value={selectedCase.market} />
                  <SideRow label="Product" value={`${selectedCase.articleId} / ${selectedCase.partNumber}`} />
                </div>
              </Panel>

              <Panel title="Follow up now" description="Fast actions for the current case.">
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

              <Panel title="External ticket" description="Mocked handoff with visible sync back into Qontrol.">
                <div className="stack-list">
                  <SideRow label="System" value={selectedCase.external?.system ?? "Jira"} />
                  <SideRow label="Ticket" value={selectedCase.external?.ticketId ?? "Not created"} />
                  <SideRow label="Status" value={selectedCase.external?.status ?? "Draft"} />
                  <SideRow label="Sync" value={selectedCase.external?.sync ?? "awaiting push"} />
                  <SideRow label="Last external update" value={selectedCase.external?.lastUpdate ?? "None"} />
                </div>
                <div className="action-stack top-gap">
                  <button className="secondary-button" onClick={handleCreateMockTicket} type="button">
                    Create mock Jira ticket
                  </button>
                  <button className="secondary-button" onClick={handleMockInboundUpdate} type="button">
                    Mock inbound Jira update
                  </button>
                </div>
              </Panel>

              <Panel title="Requested action package" description="Shown lightly in QM, more prominently in the team ticket.">
                <div className="requested-action">
                  <div>
                    <h4>Containment</h4>
                    <p>{selectedCase.requestedAction.containment}</p>
                  </div>
                  <div>
                    <h4>Permanent fix</h4>
                    <p>{selectedCase.requestedAction.permanentFix}</p>
                  </div>
                  <div>
                    <h4>Validation ask</h4>
                    <p>{selectedCase.requestedAction.validation}</p>
                  </div>
                </div>
              </Panel>

              <Panel title="Learnings" description="Reusable notes captured during routing and closure.">
                <ul className="bullet-list compact">
                  {selectedCase.learnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Panel>
            </div>
          </section>
          {selectedCase.state !== "closed" ? (
            <section className="case-footer-actions card-surface">
              <button
                className="danger-button"
                disabled={isMutating}
                onClick={handleCloseCase}
                type="button"
              >
                Close case
              </button>
            </section>
          ) : null}
            </>
              ) : (
                <section className="detail-header card-surface">
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
                </section>
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card-surface panel">
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
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

const severityRank: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function isFollowUpOverdue(item: QontrolCase) {
  return new Date(item.nextFollowUpAt).getTime() < Date.now();
}

function isFollowUpSoon(item: QontrolCase) {
  const next = new Date(item.nextFollowUpAt).getTime();
  const diff = next - Date.now();
  return diff > 0 && diff < 1000 * 60 * 60 * 24;
}

function followStatusClass(item: QontrolCase) {
  if (isFollowUpOverdue(item)) return "danger";
  if (isFollowUpSoon(item)) return "warning";
  return "neutral";
}

function countByState(items: QontrolCase[], state: CaseState) {
  return items.filter((item) => item.state === state).length;
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

function formatShortNow() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function clarityTone(clarity: QontrolCase["clarity"]) {
  if (clarity === "match") return "teal";
  if (clarity === "needs clarification") return "warning";
  return "danger";
}

function severityTone(severity: Severity) {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "success";
}

function outcomeTone(outcome: SimilarTicket["outcome"]) {
  if (outcome === "worked") return "success";
  if (outcome === "partial") return "warning";
  return "danger";
}
