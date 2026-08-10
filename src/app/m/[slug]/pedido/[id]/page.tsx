import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cartCookieName } from "@/server/cart/cart-token";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { PublicOrderRefresh } from "@/features/orders/public-order-refresh";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const paymentLabels: Record<string, string> = {
  pending: "Pendente",
  authorized: "Autorizado",
  paid: "Pago",
  failed: "Falhou",
  partially_refunded: "Parcialmente estornado",
  refunded: "Estornado",
};

const fulfillmentLabels: Record<string, string> = {
  pending: "Aguardando operação",
  awaiting_assignment: "Aguardando entregador",
  assigned: "Entregador definido",
  picked_up: "Pedido retirado pelo entregador",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  awaiting_pickup: "Aguardando retirada",
  picked_up_by_customer: "Retirado",
  served: "Servido",
  canceled: "Cancelado",
  not_required: "Não aplicável",
};

export default async function PublicOrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const token = (await cookies()).get(cartCookieName(slug))?.value;
  if (!token) notFound();
  const data = await PublicOrderService.get(slug, id, token);
  if (!data) notFound();

  const { order, items, store } = data;
  const terminal = order.order_status === "completed" || order.order_status === "canceled" || order.order_status === "rejected";

  return (
    <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818", padding: "18px 12px 64px" }}>
      {!terminal ? <PublicOrderRefresh /> : null}
      <div style={{ width: "min(760px, 100%)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <Link href={`/m/${slug}`} style={{ color: "#6f675f", fontWeight: 700 }}>← Cardápio</Link>
          <strong>Pede<span style={{ color: "#FF6B00" }}>Aqui</span></strong>
        </div>

        <header style={{ padding: 20, borderRadius: 22, background: "#171717", color: "#fffdf9" }}>
          <p style={{ margin: 0, color: "#bbb4ac", fontSize: 13 }}>{store.name}</p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
            <h1 style={{ margin: "5px 0" }}>Pedido #{order.display_number}</h1>
            <strong style={{ color: "#FF6B00" }}>{money(Number(order.total_cents))}</strong>
          </div>
          <p style={{ margin: 0, color: "#d8d2cb" }}>{orderStatusLabels[order.order_status as keyof typeof orderStatusLabels]}</p>
        </header>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Acompanhamento</h2>
          <div style={statusGrid}>
            <Status label="Pedido" value={orderStatusLabels[order.order_status as keyof typeof orderStatusLabels]} />
            <Status label="Produção" value={productionStatusLabels[order.production_status as keyof typeof productionStatusLabels]} />
            <Status label="Pagamento" value={paymentLabels[order.payment_status] ?? order.payment_status} />
            <Status label={order.fulfillment_type === "delivery" ? "Entrega" : "Retirada"} value={fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status} />
          </div>
          {!terminal ? <p style={{ margin: 0, color: "#716b64", fontSize: 12 }}>Esta página atualiza automaticamente enquanto o pedido estiver em andamento.</p> : null}
          {order.cancel_reason ? <div style={{ padding: 12, borderRadius: 12, background: "#fee4e2", color: "#9f281d" }}>Motivo: {order.cancel_reason}</div> : null}
        </section>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Itens</h2>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "10px 0", borderTop: "1px solid #eee7df", display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{item.quantity}× {item.product_name_snapshot}</strong>
                <strong>{money(Number(item.line_total_cents))}</strong>
              </div>
              {item.modifiers.length > 0 ? <div style={{ color: "#716b64", fontSize: 12 }}>{item.modifiers.map((m) => m.modifier_name_snapshot).join(" · ")}</div> : null}
              {item.note ? <div style={{ color: "#716b64", fontSize: 12 }}>Obs.: {item.note}</div> : null}
            </div>
          ))}
        </section>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Resumo</h2>
          <Summary label="Subtotal" value={money(Number(order.subtotal_cents))} />
          <Summary label="Entrega" value={Number(order.delivery_fee_cents) > 0 ? money(Number(order.delivery_fee_cents)) : "Grátis / não aplicável"} />
          <Summary label="Total" value={money(Number(order.total_cents))} strong />
          <Summary label="Pagamento" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot} />
          {order.cash_change_for_cents ? <Summary label="Troco para" value={money(Number(order.cash_change_for_cents))} /> : null}
        </section>

        {order.fulfillment_type === "delivery" ? (
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Entrega</h2>
            <div>{order.address_street_snapshot}, {order.address_number_snapshot}{order.address_complement_snapshot ? ` — ${order.address_complement_snapshot}` : ""}</div>
            <div style={{ color: "#716b64" }}>{order.address_district_snapshot} · {order.address_city_snapshot}/{order.address_state_snapshot}</div>
            {order.delivery_estimated_min_minutes !== null && order.delivery_estimated_max_minutes !== null ? <div style={{ color: "#716b64", fontSize: 13 }}>Estimativa registrada: {order.delivery_estimated_min_minutes}–{order.delivery_estimated_max_minutes} min</div> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 12, borderRadius: 14, background: "#f7f2ec" }}><div style={{ color: "#8a837b", fontSize: 11, fontWeight: 800 }}>{label.toUpperCase()}</div><strong style={{ display: "block", marginTop: 4 }}>{value}</strong></div>;
}
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: strong ? 18 : 14 }}><span>{label}</span><strong style={strong ? { color: "#FF6B00" } : undefined}>{value}</strong></div>;
}
const cardStyle: React.CSSProperties = { padding: 18, background: "#fff", border: "1px solid #eee7df", borderRadius: 20, display: "grid", gap: 12 };
const statusGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 };
