"use client";

import { useEffect, useState } from "react";
import type { InitiativeRow } from "@/lib/portfolio-data";
import Link from "next/link";

export default function InitiativesPage() {
  const [rows, setRows] = useState<InitiativeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portfolio/initiatives");
        if (!res.ok) throw new Error("Failed to load initiatives");
        const data = await res.json();
        if (!cancelled) setRows(data);
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
          <h1>Initiatives & impact</h1>
          <p className="hero-copy">
            All product_action rows. Closed initiatives with linked defect codes can be
            compared before/after to estimate improvement.
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
      <div className="pf-table-wrap">
        <table className="pf-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Type</th>
              <th>Status</th>
              <th>User</th>
              <th>Defect</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows
              ? rows.map((r) => (
                  <tr key={r.action_id}>
                    <td className="detail-id">{r.action_id}</td>
                    <td>{r.ts?.slice(0, 10) ?? "—"}</td>
                    <td>{r.action_type}</td>
                    <td>
                      <span
                        className={`badge badge-${r.status === "done" || r.status === "closed" ? "success" : r.status === "open" ? "warning" : "neutral"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>{r.user_id ?? "—"}</td>
                    <td className="detail-id">{r.defect_id ?? "—"}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.comments ?? "—"}
                    </td>
                  </tr>
                ))
              : Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><div className="pf-skeleton" style={{ height: 18 }} /></td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
