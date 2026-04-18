"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";

type BriefingResponse = {
  markdown: string;
  generatedAt: string;
  model?: string;
  error?: string;
  details?: string;
};

const ID_PATTERN =
  /\b(DEF-[0-9]{5}|PRD-[0-9]{5}|PA-[0-9]{5}|FC-[0-9]{5}|TR-[0-9]{6})\b/g;

function linkifyIds(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  const re = new RegExp(ID_PATTERN.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={`t-${key++}`}>{text.slice(last, m.index)}</span>,
      );
    }
    const id = m[0];
    let href = "/portfolio";
    if (id.startsWith("PA-")) href = "/portfolio/initiatives";
    out.push(
      <Link key={`l-${key++}`} href={href} className="briefing-id-link">
        {id}
      </Link>,
    );
    last = m.index + id.length;
  }
  if (last < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }
  return out;
}

function parseSections(markdown: string): { title: string; body: string }[] {
  const trimmed = markdown.trim();
  if (!trimmed) return [];
  const chunks = trimmed.split(/\n(?=## )/);
  const out: { title: string; body: string }[] = [];
  for (const chunk of chunks) {
    const c = chunk.trimStart();
    const lines = c.split("\n");
    const first = lines[0] ?? "";
    if (!first.startsWith("##")) {
      out.push({ title: "Introduction", body: c.trim() });
      continue;
    }
    const title = first.replace(/^##\s+/, "").trim();
    const body = lines.slice(1).join("\n").trim();
    out.push({ title, body });
  }
  return out;
}

function BriefingBody({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="briefing-body">
      {paragraphs.map((p, i) => (
        <p key={i} className="briefing-para">
          {linkifyIds(p)}
        </p>
      ))}
    </div>
  );
}

export function QualityBriefingPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<BriefingResponse | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/quality-briefing", { method: "POST" });
      const json = (await res.json()) as BriefingResponse;
      if (!res.ok) {
        setData(null);
        setErr(json.details ?? json.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const sections = useMemo(() => {
    if (!data?.markdown) return [];
    return parseSections(data.markdown);
  }, [data?.markdown]);

  return (
    <section className="pf-section briefing-embed" aria-label="AI quality briefing">
      <div className="briefing-embed-header">
        <div>
          <h2 className="briefing-embed-title">AI Quality Manager briefing</h2>
          <p className="chart-desc briefing-embed-desc">
            Short AI summary of current quality themes. Regenerate anytime; tap an
            ID to open the related portfolio view.
          </p>
        </div>
        <div className="briefing-actions">
          <button
            type="button"
            className="briefing-regen-btn"
            onClick={() => void run()}
            disabled={loading}
          >
            {loading ? "Generating…" : data ? "Regenerate" : "Generate briefing"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="card-surface panel briefing-error" role="alert">
          <p>{err}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="briefing-loading card-surface panel">
          <p>Loading quality data and calling the model…</p>
          <div className="pf-skeleton" style={{ height: 120, marginTop: 16 }} />
        </div>
      ) : null}

      {data?.generatedAt && !loading ? (
        <p className="briefing-timestamp">
          Generated at{" "}
          {new Date(data.generatedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {data.model ? (
            <>
              {" "}
              · Model <code className="kpi-code">{data.model}</code>
            </>
          ) : null}
        </p>
      ) : null}

      {data?.markdown && !loading ? (
        <div className="briefing-sections">
          {sections.map((sec, idx) => (
            <details
              key={`${sec.title}-${idx}`}
              className="briefing-card card-surface panel"
              open={idx < 3}
            >
              <summary className="briefing-summary">{sec.title}</summary>
              {sec.body ? <BriefingBody text={sec.body} /> : null}
            </details>
          ))}
        </div>
      ) : null}

      {!data && !loading && !err ? (
        <p className="chart-desc" style={{ marginTop: 4 }}>
          Click <strong>Generate briefing</strong> to fetch data and produce the report.
        </p>
      ) : null}
    </section>
  );
}
