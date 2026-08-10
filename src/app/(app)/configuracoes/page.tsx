import Link from "next/link";

const items = [
  ["Cardápio digital", "Identidade, publicação, entrega/retirada e pedido mínimo.", "/configuracoes/cardapio"],
  ["Horários", "Períodos de funcionamento, inclusive após meia-noite.", "/configuracoes/horarios"],
  ["Entrega", "Prazo, taxa padrão, frete grátis e bairros atendidos.", "/configuracoes/entrega"],
  ["Pagamentos", "Pix, cartões e dinheiro disponíveis no checkout.", "/configuracoes/pagamentos"],
] as const;

export default function SettingsPage() {
  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>Configurações</h1>
        <p className="muted">Ajustes operacionais da unidade atual.</p>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {items.map(([title, description, href]) => (
          <Link key={href} href={href} className="card" style={{ padding: 18, display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 17 }}>{title}</strong>
            <span className="muted">{description}</span>
            <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 12, marginTop: 8 }}>ABRIR →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
