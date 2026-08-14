import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { KitchenService } from "@/server/kitchen/kitchen-service";

export default async function ProductionPage() {
  const { storeId, stations, orders, snapshotAt } = await KitchenService.snapshot();

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>KDS · Produção em tempo real</p>
          <h1 style={{ margin: "var(--space-1) 0" }}>Produção</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "var(--content-reading)" }}>
            Leia o pedido à distância, filtre por estação e avance o preparo pelas mesmas regras operacionais do PedeAqui.
          </p>
        </div>
        <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>{stations.length} estação(ões) ativa(s)</div>
      </header>

      <KitchenBoard storeId={storeId} stations={stations} orders={orders} initialNow={snapshotAt} />
    </section>
  );
}
