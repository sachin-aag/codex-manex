"use client";

import { useCallback, useEffect, useState } from "react";

import type { CeoReportArtifactMetadata } from "@/lib/ceo-report/types";

type ApiErrorPayload = {
  error?: string;
  details?: string;
};

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== "object") return false;
  return "error" in value || "details" in value;
}

export function CeoReportPage() {
  const [data, setData] = useState<CeoReportArtifactMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ceo-report", { method: "GET" });
      const payload = (await response.json()) as CeoReportArtifactMetadata | ApiErrorPayload;
      if (!response.ok) {
        throw new Error(
          isApiErrorPayload(payload)
            ? payload.details ?? payload.error ?? `HTTP ${response.status}`
            : `HTTP ${response.status}`,
        );
      }
      setData(payload as CeoReportArtifactMetadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!data) return;
    setCurrentSlideIndex((current) =>
      Math.min(current, Math.max(data.slides.length - 1, 0)),
    );
  }, [data]);

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/ceo-report/generate", { method: "POST" });
      const payload = (await response.json()) as CeoReportArtifactMetadata | ApiErrorPayload;
      if (!response.ok) {
        throw new Error(
          isApiErrorPayload(payload)
            ? payload.details ?? payload.error ?? `HTTP ${response.status}`
            : `HTTP ${response.status}`,
        );
      }
      setData(payload as CeoReportArtifactMetadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate report.");
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <main className="page-shell">
        <section className="hero-strip portfolio-hero-headline">
          <div>
            <p className="eyebrow">CEO Report</p>
            <h1>Generating weekly executive deck…</h1>
            <p className="hero-copy">
              Qontrol is assembling the latest PowerPoint report and slide previews.
            </p>
          </div>
        </section>
        <div className="pf-loading-grid">
          {[1, 2, 3, 4].map((index) => (
            <div key={index} className="pf-skeleton" />
          ))}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page-shell">
        <section className="hero-strip portfolio-hero-headline">
          <div>
            <p className="eyebrow">CEO Report</p>
            <h1>Executive deck unavailable</h1>
            <p className="hero-copy">
              The weekly CEO report could not be generated from the current environment.
            </p>
          </div>
        </section>
        <div className="card-surface panel" role="alert">
          <p style={{ color: "var(--danger)" }}>{error ?? "Unknown error"}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button type="button" className="primary-button" onClick={() => void loadReport()}>
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  const report = data;
  const hasSlides = report.slides.length > 0;
  const activeSlide = hasSlides ? report.slides[currentSlideIndex] : null;

  function showPreviousSlide() {
    if (!hasSlides) return;
    setCurrentSlideIndex((current) =>
      current === 0 ? report.slides.length - 1 : current - 1,
    );
  }

  function showNextSlide() {
    if (!hasSlides) return;
    setCurrentSlideIndex((current) =>
      current === report.slides.length - 1 ? 0 : current + 1,
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-strip portfolio-hero-headline ceo-report-hero">
        <div>
          <p className="eyebrow">CEO Report</p>
          <h1>{report.title}</h1>
          <p className="hero-copy">{report.subtitle}</p>
        </div>
        <div className="ceo-report-hero-actions">
          <a
            className="primary-button ceo-report-link-button"
            href={report.downloadUrl}
            download
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon />
            Download PowerPoint
          </a>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleRegenerate()}
            disabled={regenerating}
          >
            {regenerating ? "Regenerating…" : "Regenerate report"}
          </button>
        </div>
      </section>

      {error ? (
        <div className="card-surface panel ceo-report-inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <section className="kpi-bar" aria-label="CEO report metadata">
        <div className="kpi-card">
          <span className="kpi-card-label">Generated</span>
          <span className="kpi-card-value ceo-report-kpi-value">
            {formatTimestamp(report.generatedAt)}
          </span>
          <p className="kpi-card-hint">Latest deck creation time</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Next scheduled</span>
          <span className="kpi-card-value ceo-report-kpi-value">
            {formatTimestamp(report.nextGenerationAt)}
          </span>
          <p className="kpi-card-hint">Display-only weekly cadence</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">High severity in deck</span>
          <span className="kpi-card-value">{report.highSeverityTicketCount}</span>
          <p className="kpi-card-hint">
            Comparing {report.summary.comparisonLastWeekLabel} to {report.summary.comparisonThisWeekLabel}
          </p>
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Executive flag</span>
          <span className="kpi-card-value">
            {report.laggingTeam.team ?? "Balanced"}
          </span>
          <p className="kpi-card-hint">{report.laggingTeam.headline}</p>
        </div>
      </section>

      <section className="pf-section">
        <div className="card-surface panel ceo-report-summary-panel">
          <div className="ceo-report-summary-copy">
            <h3>This week at a glance</h3>
            <p className="chart-desc">
              {report.summary.openTickets} open tickets, {report.summary.highSeverityOpen}{" "}
              high-severity cases, and {report.summary.overdueOpen} overdue follow-ups are
              reflected in this week&apos;s deck.
            </p>
          </div>
          <div className="ceo-report-badge-row">
            {report.narrativeCards.map((card) => (
              <div key={card.title} className={`ceo-report-badge ceo-report-badge-${card.tone}`}>
                <strong>{card.metricValue}</strong>
                <span>{card.metricLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="ceo-report-section-head">
          <div>
            <p className="eyebrow">Deck Preview</p>
            <h3>Weekly executive slides</h3>
          </div>
          <a
            className="secondary-button ceo-report-link-button ceo-report-link-button-secondary"
            href={report.downloadUrl}
            download
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon />
            Download report
          </a>
        </div>
        <article className="card-surface panel ceo-report-carousel">
          <div className="ceo-report-slide-head">
            <div>
              <p className="eyebrow">Slide {hasSlides ? currentSlideIndex + 1 : "Preview"}</p>
              <h3>{activeSlide?.title ?? "Slide preview unavailable"}</h3>
            </div>
            <div className="ceo-report-carousel-meta">
              <span>
                {hasSlides ? currentSlideIndex + 1 : 0} / {report.slides.length}
              </span>
            </div>
          </div>

          <div className="ceo-report-carousel-body">
            <button
              type="button"
              className="secondary-button ceo-report-carousel-button"
              onClick={showPreviousSlide}
              aria-label="Show previous slide"
              disabled={!hasSlides}
            >
              ‹
            </button>

            {activeSlide ? (
              <div className="ceo-report-slide-stage">
                <img
                  src={activeSlide.imageUrl}
                  alt={`${activeSlide.title} preview`}
                  className="ceo-report-slide-image ceo-report-slide-image-large"
                />
              </div>
            ) : (
              <div className="ceo-report-slide-stage ceo-report-slide-stage-empty">
                <p className="chart-desc">Slide previews will appear here after the deck is rendered.</p>
              </div>
            )}

            <button
              type="button"
              className="secondary-button ceo-report-carousel-button"
              onClick={showNextSlide}
              aria-label="Show next slide"
              disabled={!hasSlides}
            >
              ›
            </button>
          </div>

          <div className="ceo-report-carousel-footer">
            <div className="ceo-report-carousel-dots" aria-label="Slide navigation">
              {report.slides.map((slide, index) => (
                <button
                  key={slide.imageUrl}
                  type="button"
                  className={`ceo-report-carousel-dot ${
                    index === currentSlideIndex ? "is-active" : ""
                  }`}
                  onClick={() => setCurrentSlideIndex(index)}
                  aria-label={`Go to slide ${index + 1}: ${slide.title}`}
                  aria-pressed={index === currentSlideIndex}
                />
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="pf-section">
        <div className="ceo-report-narrative-grid">
          {report.narrativeCards.map((card) => (
            <div key={card.title} className={`card-surface panel ceo-report-narrative-card ceo-report-narrative-card-${card.tone}`}>
              <div className="ceo-report-narrative-metric">
                <span>{card.metricLabel}</span>
                <strong>{card.metricValue}</strong>
              </div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
