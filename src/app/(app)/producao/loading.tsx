export default function ProductionLoading() {
  return (
    <section style={{ display: "grid", gap: 14 }} aria-busy="true" aria-live="polite">
      <div>
        <div className="muted" style={{ fontSize: 13 }}>KDS · Produção em tempo real</div>
        <h1 style={{ margin: "4px 0" }}>Produção</h1>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 12 }}>
        {[1, 2, 3].map((item) => (
          <div key={item} className="card" style={{ minHeight: 240, padding: 18 }}>
            <strong>Carregando pedidos…</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
