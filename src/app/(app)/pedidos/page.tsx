import { OrderManagerBoard } from "@/features/orders/order-manager-board";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import { OrderService } from "@/server/orders/order-service";

export default async function OrdersPage() {
  const { context, orders } = await OrderService.list(200);
  if (!context.storeId) throw new Error("An active store is required");

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Operação em tempo real</p>
          <h1 style={{ margin: "4px 0" }}>Gestor de Pedidos</h1>
          <p className="muted" style={{ margin: 0 }}>Kanban derivado dos estados independentes de pedido, produção, pagamento e fulfillment.</p>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Nenhum mega-status é persistido.</div>
      </header>

      <OrderManagerBoard storeId={context.storeId} orders={orders as OrderManagerRow[]} />
    </section>
  );
}
