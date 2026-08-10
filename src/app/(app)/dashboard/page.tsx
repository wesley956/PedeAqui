const cards = [
  ["Vendas hoje", "R$ 0,00"],
  ["Pedidos hoje", "0"],
  ["Ticket médio", "R$ 0,00"],
  ["Pedidos abertos", "0"],
] as const;

export default function DashboardPage() {
  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p className="muted">Fundação do painel administrativo. Os indicadores serão conectados ao motor de pedidos na Fase 1.</p>
      </div>
      <div className="metric-grid">
        {cards.map(([label, value]) => (
          <article className="card metric-card" key={label}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <article className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Fundação em construção</h2>
        <p className="muted" style={{ marginBottom: 0 }}>Organizações, unidades, permissões, auditoria, eventos e idempotência são as próximas camadas conectadas a este shell.</p>
      </article>
    </section>
  );
}
