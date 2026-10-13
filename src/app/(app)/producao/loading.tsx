import { PageHeader } from "@/components/ui/page-header";

export default function ProductionLoading() {
  return (
    <section style={{ display: "grid", gap: 14 }} aria-busy="true" aria-live="polite">
      <PageHeader title="Produção" description="Carregando os pedidos da cozinha…" />
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
