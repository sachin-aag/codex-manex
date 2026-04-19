export default function RdLoading() {
  return (
    <main className="page-shell" data-dept="rd">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">R&D · Design / Reliability</p>
          <h1>Loading R&D workspace…</h1>
        </div>
      </section>
      <div className="pf-loading-grid" style={{ marginTop: 8 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="pf-skeleton" style={{ height: i <= 3 ? 100 : 140 }} />
        ))}
      </div>
    </main>
  );
}
