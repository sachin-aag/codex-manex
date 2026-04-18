"use client";

import { useEffect, useState } from "react";
import type { LearningSignal } from "@/lib/portfolio-data";
import Link from "next/link";

export default function LearningsPage() {
  const [learnings, setLearnings] = useState<LearningSignal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        if (!cancelled) setLearnings(json.learnings);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="page-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">QM Portfolio</p>
          <h1>Learnings</h1>
          <p className="hero-copy">
            Automated signals from the four seeded stories plus statistical spikes.
            Each learning is grounded in evidence and can trigger an optimization initiative.
          </p>
        </div>
        <Link href="/portfolio" className="ghost-button" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          ← Back to portfolio
        </Link>
      </section>
      {err ? (
        <div className="card-surface panel">
          <p style={{ color: "var(--danger)" }}>{err}</p>
        </div>
      ) : null}
      <div className="pf-learnings-grid">
        {learnings
          ? learnings.map((s) => (
              <div key={s.id} id={s.id} className={`card-surface panel pf-learning-card ${severityRing(s.severity)}`}>
                <div className="pf-learning-top">
                  <h3>{s.title}</h3>
                  <span className={`badge badge-${badgeTone(s.severity)}`}>{s.severity}</span>
                </div>
                <p className="pf-learning-story">{s.story}</p>
                <div className="card-surface" style={{ padding: 16, marginTop: 12, background: "var(--surface-subtle)" }}>
                  <h4 style={{ margin: "0 0 8px" }}>Why this matters</h4>
                  <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>{s.why}</p>
                </div>
                <p className="pf-learning-evidence" style={{ marginTop: 12 }}>
                  {s.evidenceCount} evidence row(s)
                </p>
              </div>
            ))
          : [1, 2, 3].map((i) => <div key={i} className="pf-skeleton" style={{ height: 180 }} />)}
      </div>
    </main>
  );
}

function severityRing(sev: string) {
  if (sev === "critical" || sev === "high") return "pf-learning-high";
  if (sev === "medium") return "pf-learning-medium";
  return "pf-learning-low";
}

function badgeTone(sev: string) {
  if (sev === "critical" || sev === "high") return "danger";
  if (sev === "medium") return "warning";
  return "neutral";
}
