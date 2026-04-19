"use client";

import { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const HINT: ChatMessage = {
  role: "assistant",
  content:
    "Ask about any recommendation or push back - I have the full portfolio context. Reference decisions or IDs by name (INI-00002, SB-00007, PM-00008, etc.).",
};

export function InsightsChatPanel({
  open,
  onClose,
}: {
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

  async function send() {
    const text = input.trim();
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
      const reply: ChatMessage = json.message;
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

  return (
    <>
      {open ? (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 950,
          }}
        />
      ) : null}
      <aside
        aria-hidden={!open}
        aria-label="Insights chat"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 400,
          maxWidth: "100vw",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-6px 0 24px rgba(0,0,0,0.18)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease",
          display: "flex",
          flexDirection: "column",
          zIndex: 960,
        }}
      >
        <header
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Insights agent</p>
            <h3 style={{ margin: "2px 0 0", fontSize: 16 }}>Chat</h3>
          </div>
          <button
            type="button"
            aria-label="Close chat"
            onClick={onClose}
            className="ghost-button"
            style={{ padding: "4px 10px", fontSize: 13 }}
          >
            Close
          </button>
        </header>

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {sending ? (
            <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-muted)" }}>
              thinking...
            </div>
          ) : null}
        </div>

        {err ? (
          <p
            style={{
              margin: 0,
              padding: "6px 16px",
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
            padding: 12,
            borderTop: "1px solid var(--border)",
            display: "grid",
            gap: 8,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Challenge a recommendation, give new info, or ask for a deeper look..."
            rows={3}
            disabled={sending}
            style={{
              resize: "vertical",
              minHeight: 72,
              padding: "8px 10px",
              fontFamily: "inherit",
              fontSize: 13,
              background: "var(--surface-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Enter to send · Shift+Enter for newline
            </span>
            <button
              type="submit"
              className="ghost-button"
              disabled={sending || !input.trim()}
              style={{ fontSize: 13 }}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "88%",
        padding: "8px 12px",
        borderRadius: 10,
        background: isUser ? "var(--accent, #0b5394)" : "var(--surface-subtle)",
        color: isUser ? "white" : "var(--text-primary)",
        fontSize: 13,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        border: isUser ? "none" : "1px solid var(--border)",
      }}
    >
      {message.content}
    </div>
  );
}
