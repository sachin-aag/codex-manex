"use client";

type Tone = "good" | "warn" | "bad" | "neutral";

export type RdKpiBarModel = {
  designLeakCount: number;
  avgLagWeeksLabel: string;
  lagPatternHint: string;
  nearMissCount: number;
  nearMissHint: string;
  articlesCount: number;
  articlesHint: string;
  fmeaValueLabel: string;
  fmeaHint: string;
  tones: {
    designLeak: Tone;
    avgLag: Tone;
    nearMiss: Tone;
    articles: Tone;
    fmea: Tone;
  };
};

export function RdKpiBar({ model }: { model: RdKpiBarModel }) {
  const {
    designLeakCount,
    avgLagWeeksLabel,
    lagPatternHint,
    nearMissCount,
    nearMissHint,
    articlesCount,
    articlesHint,
    fmeaValueLabel,
    fmeaHint,
    tones,
  } = model;

  return (
    <section className="kpi-bar kpi-bar--5 rd-kpi-bar" aria-label="R&D KPIs">
      <div className={`kpi-card kpi-card--tone-${tones.designLeak}`}>
        <span className="kpi-card-label">Design leak signals</span>
        <span className="kpi-card-value">{designLeakCount}</span>
        <p className="kpi-card-hint">Claims with zero factory match</p>
      </div>
      <div className={`kpi-card kpi-card--tone-${tones.avgLag}`}>
        <span className="kpi-card-label">Avg. build-to-failure lag</span>
        <span className="kpi-card-value">{avgLagWeeksLabel}</span>
        <p className="kpi-card-hint">{lagPatternHint}</p>
      </div>
      <div className={`kpi-card kpi-card--tone-${tones.nearMiss}`}>
        <span className="kpi-card-label">Near-miss trending up</span>
        <span className="kpi-card-value">{nearMissCount}</span>
        <p className="kpi-card-hint">{nearMissHint}</p>
      </div>
      <div className={`kpi-card kpi-card--tone-${tones.articles}`}>
        <span className="kpi-card-label">Articles under review</span>
        <span className="kpi-card-value">{articlesCount}</span>
        <p className="kpi-card-hint">{articlesHint}</p>
      </div>
      <div className={`kpi-card kpi-card--tone-${tones.fmea}`}>
        <span className="kpi-card-label">FMEA actions open</span>
        <span className="kpi-card-value">{fmeaValueLabel}</span>
        <p className="kpi-card-hint">{fmeaHint}</p>
      </div>
    </section>
  );
}
