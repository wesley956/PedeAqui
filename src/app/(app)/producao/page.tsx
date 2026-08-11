import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { KitchenService } from "@/server/kitchen/kitchen-service";

export default async function ProductionPage() {
  const { storeId, stations, orders } = await KitchenService.snapshot();

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>KDS · Produção em tempo real</p>
          <h1 style={{ margin: "4px 0" }}>Produção</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 760 }}>
            Pedidos confirmados, itens roteados por estação, tempo decorrido e destaque automático de atraso. O status continua sendo o mesmo motor de pedidos do PedeAqui.
          </p>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{stations.length} estação(ões) ativa(s)</div>
      </header>

      <KitchenBoard storeId={storeId} stations={stations} orders={orders} initialNow={Date.now()} />
    </section>
  );
}
