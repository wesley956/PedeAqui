import Link from "next/link";
import { OrderRealtime } from "@/features/orders/order-realtime";
import { OrderService } from "@/server/orders/order-service";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default async function OrdersPage() {
  const { context, orders } = await OrderService.list();
  if (!context.storeId) throw new Error("An active store is required");

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <OrderRealtime storeId={context.storeId} />
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Operação em tempo real</p>
        <h1 style={{ margin: "4px 0" }}>Pedidos</h1>
        <p className="muted" style={{ margin: 0 }}>Lista operacional básica. O Kanban completo entra no bloco #083.</p>
      </header>

      <div style={{ display: "grid", gap: 10 }}>
        {orders.length === 0 ? (
          <div className="card" style={{ padding: 28, textAlign: "center" }}>
            <strong>Nenhum pedido ainda</strong>
            <p className="muted" style={{ marginBottom: 0 }}>Pedidos criados pelo cardápio digital aparecerão aqui automaticamente.</p>
          </div>
        ) : orders.map((order) => (
          <Link key={order.id} href={`/pedidos/${order.id}`} className="card" style={{ padding: 15, display: "grid", gridTemplateColumns: "80px minmax(0,1fr) repeat(3, auto)", gap: 18, alignItems: "center" }}>
            <div><span className="muted" style={{ fontSize: 11 }}>PEDIDO</span><div style={{ fontWeight: 950, fontSize: 18 }}>#{order.display_number}</div></div>
            <div style={{ minWidth: 0 }}>
              <strong>{order.customer_name_snapshot}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{order.fulfillment_type === "delivery" ? "Entrega" : "Retirada"} · {new Date(order.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <Status label="Pedido" value={orderStatusLabels[order.order_status as keyof typeof orderStatusLabels]} />
            <Status label="Produção" value={productionStatusLabels[order.production_status as keyof typeof productionStatusLabels]} />
            <div style={{ textAlign: "right" }}><span className="muted" style={{ fontSize: 11 }}>TOTAL</span><div style={{ fontWeight: 900 }}>{money(Number(order.total_cents))}</div></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <div><span className="muted" style={{ fontSize: 11 }}>{label.toUpperCase()}</span><div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{value}</div></div>;
}
