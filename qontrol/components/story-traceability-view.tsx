"use client";

import { useEffect, useId, useState } from "react";

import type { CaseTraceability } from "@/lib/qontrol-data";

type Props = {
  traceability?: CaseTraceability;
};

export function StoryTraceabilityView({ traceability }: Props) {
  const renderId = useId().replaceAll(":", "");
  const [svg, setSvg] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const traceabilityData = traceability;

  useEffect(() => {
    if (!traceabilityData) return;
    const currentTraceability = traceabilityData;
    let active = true;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "neutral",
        });
        const { svg: rendered } = await mermaid.render(
          `traceability-${renderId}`,
          currentTraceability.mermaid,
        );
        if (!active) return;
        setSvg(rendered);
        setRenderError(null);
      } catch (error) {
        if (!active) return;
        setRenderError(error instanceof Error ? error.message : "Unable to render Mermaid diagram.");
        setSvg("");
      }
    }

    void renderDiagram();

    return () => {
      active = false;
    };
  }, [renderId, traceabilityData]);

  if (!traceabilityData) return null;

  return (
    <section className="story-traceability-widget">
      <div className="story-traceability-header">
        <div>
          <h4>{traceabilityData.title}</h4>
          <p>{traceabilityData.summary}</p>
        </div>
      </div>

      <div className="story-traceability-diagram-shell">
        {renderError ? (
          <div className="story-traceability-fallback">
            <p>{renderError}</p>
            <pre>{traceabilityData.mermaid}</pre>
          </div>
        ) : svg ? (
          <div
            className="story-traceability-diagram"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="chart-empty">Rendering traceability tree...</p>
        )}
      </div>

      <div className="story-traceability-fact-grid">
        {traceabilityData.facts.map((fact) => (
          <article
            className={`story-traceability-fact ${fact.highlight ? "highlight" : ""}`}
            key={`${fact.label}-${fact.value}`}
          >
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </article>
        ))}
      </div>

      <ul className="bullet-list compact">
        {traceabilityData.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
