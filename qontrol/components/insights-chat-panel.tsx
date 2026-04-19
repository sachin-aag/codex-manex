"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_COLORS, CHART_SERIES, SEVERITY_COLORS } from "@/lib/chart-theme";
import type {
  InsightsChatAssistantPayload,
  InsightsChatEvidencePlot,
  InsightsChatEvidenceQuery,
  InsightsChatPlotTone,
} from "@/lib/portfolio-insights/chat-types";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
  payload?: InsightsChatAssistantPayload | null;
};

const HINT: ChatMessage = {
  role: "assistant",
  content: "Ask me anything about your quality data.",
};

const STARTER_QUESTIONS = [
  "Explain the rise in tickets in December.",
  "Give me a status update on the overall status of tickets.",
] as const;

const PLOT_TONE_COLORS: Record<InsightsChatPlotTone, string> = {
  brand: CHART_COLORS.barPrimary,
  danger: SEVERITY_COLORS.critical,
  warning: SEVERITY_COLORS.medium,
  success: CHART_SERIES[3],
  muted: CHART_COLORS.barSecondary,
};

export function InsightsChatPanel({
  inset,
  open,
  onClose,
}: {
  inset: { top: number; left: number; placement: "left" | "top" };
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([HINT]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(nextText?: string) {
    const text = (nextText ?? input).trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setErr(null);
    try {
      const payloadMessages = next.filter((m, i) => !(i === 0 && m === HINT));
      const res = await fetch("/api/portfolio/insights/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const reply: ChatMessage = {
        role: json.message?.role === "assistant" ? "assistant" : "assistant",
        content:
          typeof json.message?.content === "string" && json.message.content.trim()
            ? json.message.content
            : "I couldn't generate a response.",
        payload: json.message?.payload ?? null,
      };
      setMessages((prev) => [...prev, reply]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chat request failed";
      setErr(msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `(chat error: ${msg})` },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const showStarterQuestions =
    messages.length === 1 && messages[0]?.role === "assistant";

  return (
    <>
      <section
        aria-hidden={!open}
        aria-label="Insights chat"
        style={{
          position: "fixed",
          top: inset.top,
          right: 0,
          bottom: 0,
          left: inset.left,
          background: "var(--background)",
          transform: open ? "translateY(0)" : "translateY(8px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 180ms ease, transform 180ms ease",
          display: "flex",
          flexDirection: "column",
          zIndex: 1100,
          borderLeft: inset.placement === "left" ? "1px solid var(--border)" : "none",
          borderTop: inset.placement === "top" ? "1px solid var(--border)" : "none",
        }}
      >
        <header
          style={{
            padding: "18px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            background: "color-mix(in srgb, var(--surface) 94%, white)",
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              Insights copilot
            </p>
            <h2 style={{ margin: "4px 0 0", fontSize: 24 }}>Ask the portfolio</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Full-screen chat with grounded answers, charts, and SQL behind each response.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="badge badge-neutral">Portfolio Insights</span>
            <button
              type="button"
              aria-label="Close chat"
              onClick={onClose}
              className="ghost-button"
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              Close
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 28px 12px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1120,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {showStarterQuestions ? (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  alignSelf: "stretch",
                  marginTop: 2,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  Suggested questions
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: 12,
                  }}
                >
                  {STARTER_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={sending}
                      onClick={() => void send(question)}
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: 14,
                        border: "1px solid var(--border)",
                        background: "var(--brand-soft)",
                        color: "var(--brand-strong)",
                        fontSize: 14,
                        lineHeight: 1.45,
                        fontWeight: 600,
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {sending ? (
              <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-muted)" }}>
                thinking...
              </div>
            ) : null}
          </div>
        </div>

        {err ? (
          <p
            style={{
              margin: 0,
              padding: "8px 28px",
              fontSize: 11,
              color: "var(--danger)",
              borderTop: "1px solid var(--border)",
            }}
          >
            {err}
          </p>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          style={{
            padding: "16px 28px 24px",
            borderTop: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--surface) 95%, white)",
          }}
        >
          <div
            style={{
              maxWidth: 1120,
              margin: "0 auto",
              width: "100%",
              display: "grid",
              gap: 10,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask why ticket volume moved, what is driving risk, how the portfolio is trending, or what query to run next..."
              rows={4}
              disabled={sending}
              style={{
                resize: "vertical",
                minHeight: 96,
                padding: "14px 16px",
                fontFamily: "inherit",
                fontSize: 14,
                background: "var(--surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                boxShadow: "var(--shadow-sm)",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Enter to send · Shift+Enter for newline · Each answer includes collapsible charts and SQL.
              </span>
              <button
                type="submit"
                className="ghost-button"
                disabled={sending || !input.trim()}
                style={{ fontSize: 13, padding: "10px 16px" }}
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "stretch",
        width: isUser ? "auto" : "100%",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          maxWidth: isUser ? "min(720px, 72%)" : "100%",
          marginLeft: isUser ? "auto" : 0,
          padding: isUser ? "12px 14px" : "16px 18px",
          borderRadius: 16,
          background: isUser ? "var(--brand)" : "var(--surface)",
          color: isUser ? "white" : "var(--text-primary)",
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          border: isUser ? "none" : "1px solid var(--border)",
          boxShadow: isUser ? "none" : "var(--shadow-sm)",
        }}
      >
        {message.content}
      </div>
      {!isUser && message.payload ? <EvidenceAccordion payload={message.payload} /> : null}
    </div>
  );
}

function EvidenceAccordion({ payload }: { payload: InsightsChatAssistantPayload }) {
  return (
    <details
      open
      style={{
        width: "100%",
        border: "1px solid var(--border)",
        borderRadius: 16,
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "14px 16px",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-primary)",
          background: "var(--surface-subtle)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        Plots and queries behind this answer
        <span style={{ marginLeft: 8, fontWeight: 500, color: "var(--text-muted)" }}>
          {payload.plots.length} plot{payload.plots.length === 1 ? "" : "s"} · {payload.queries.length} quer
          {payload.queries.length === 1 ? "y" : "ies"}
        </span>
      </summary>
      <div style={{ padding: 16, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 14 }}>
          {payload.plots.map((plot) => (
            <EvidencePlotCard key={plot.id} plot={plot} />
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
          {payload.queries.map((query) => (
            <EvidenceQueryCard key={query.id} query={query} />
          ))}
        </div>
      </div>
    </details>
  );
}

function EvidencePlotCard({ plot }: { plot: InsightsChatEvidencePlot }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 16,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: 15 }}>{plot.title}</h4>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
          {plot.why_it_matters}
        </p>
      </div>
      <div className="recharts-host chart-plot" style={{ height: 260 }}>
        <ResponsiveContainer>
          {plot.kind === "line" ? (
            <LineChart data={plot.data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey={plot.x_key}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={{ stroke: "var(--border)" }}
                label={{
                  value: plot.y_label,
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-muted)",
                  fontSize: 11,
                }}
              />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-primary)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {plot.series.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={PLOT_TONE_COLORS[series.tone]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART_COLORS.pointFill, strokeWidth: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={plot.data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey={plot.x_key}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={{ stroke: "var(--border)" }}
                label={{
                  value: plot.y_label,
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-muted)",
                  fontSize: 11,
                }}
              />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-primary)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {plot.series.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  fill={PLOT_TONE_COLORS[series.tone]}
                  stackId={plot.kind === "stacked-bar" ? "stack" : undefined}
                  radius={plot.kind === "stacked-bar" ? undefined : [6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function EvidenceQueryCard({ query }: { query: InsightsChatEvidenceQuery }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 16,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface-subtle)",
      }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: 15 }}>{query.title}</h4>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
          {query.why_it_matters}
        </p>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 14,
          borderRadius: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          overflowX: "auto",
          fontSize: 12,
          lineHeight: 1.55,
          fontFamily: "var(--font-mono), monospace",
          color: "var(--text-primary)",
        }}
      >
        <code>{query.sql}</code>
      </pre>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
} as const;
