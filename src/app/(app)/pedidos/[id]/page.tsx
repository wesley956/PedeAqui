import Link from "next/link";
import {
  cancelOrderAction,
  confirmOrderAction,
  transitionFulfillmentAction,
  transitionPaymentAction,
  transitionProductionAction,
} from "@/features/orders/actions";
import { OrderRealtime } from "@/features/orders/order-realtime";
import { OrderService } from "@/server/orders/order-service";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";
import { paymentMethodLabels } from "@/server/checkout/schemas";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const paymentStatusLabels: Record<string, string> = {
  pending: "Pendente", authorized: "Autorizado", paid: "Pago", failed: "Falhou",
  partially_refunded: "Parcialmente estornado", refunded: "Estornado",
};
const fulfillmentLabels: Record<string, string> = {
  pending: "Pendente", awaiting_assignment: "Aguardando entregador", assigned: "Entregador definido",
  picked_up: "Retirado pelo entregador", out_for_delivery: "Saiu para entrega", delivered: "Entregue",
  awaiting_pickup: "Aguardando retirada", picked_up_by_customer: "Retirado pelo cliente", served: "Servido",
  canceled: "Cancelado", not_required: "Não aplicável",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, order, items, history } = await OrderService.get(id);
  if (!context.storeId) throw new Error("An active store is required");

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1100 }}>
      <OrderRealtime storeId={context.storeId} />
      <div><Link href="/pedidos" className="muted">← Voltar aos pedidos</Link></div>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Pedido</p>
          <h1 style={{ margin: "3px 0" }}>#{order.display_number}</h1>
          <p className="muted" style={{ margin: 0 }}>{order.customer_name_snapshot} · {order.fulfillment_type === "delivery" ? "Entrega" : "Retirada"}</p>
        </div>
        <strong style={{ fontSize: 24, color: "var(--accent)" }}>{money(Number(order.total_cents))}</strong>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <StateCard label="Pedido" value={orderStatusLabels[order.order_status as keyof typeof orderStatusLabels]} />
        <StateCard label="Pagamento" value={paymentStatusLabels[order.payment_status] ?? order.payment_status} />
        <StateCard label="Produção" value={productionStatusLabels[order.production_status as keyof typeof productionStatusLabels]} />
        <StateCard label="Entrega/retirada" value={fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status} />
      </div>

      <article className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Ações de estado</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {order.order_status === "pending_confirmation" ? <ActionForm action={confirmOrderAction} orderId={order.id} label="Confirmar pedido" /> : null}
          {order.production_status === "pending_confirmation" ? <ActionForm action={transitionProductionAction} orderId={order.id} field="status" value="queued" label="Liberar para produção" /> : null}
          {order.production_status === "queued" ? <ActionForm action={transitionProductionAction} orderId={order.id} field="status" value="preparing" label="Iniciar preparo" /> : null}
          {order.production_status === "preparing" ? <ActionForm action={transitionProductionAction} orderId={order.id} field="status" value="ready" label="Marcar pronto" /> : null}
          {order.payment_status === "pending" ? <ActionForm action={transitionPaymentAction} orderId={order.id} field="status" value="paid" label="Marcar pago" /> : null}
          {order.fulfillment_type === "delivery" && order.fulfillment_status === "pending" ? <ActionForm action={transitionFulfillmentAction} orderId={order.id} field="status" value="awaiting_assignment" label="Aguardar entregador" /> : null}
          {order.fulfillment_type === "pickup" && order.fulfillment_status === "pending" ? <ActionForm action={transitionFulfillmentAction} orderId={order.id} field="status" value="awaiting_pickup" label="Liberar retirada" /> : null}
          {order.fulfillment_status === "awaiting_pickup" ? <ActionForm action={transitionFulfillmentAction} orderId={order.id} field="status" value="picked_up_by_customer" label="Cliente retirou" /> : null}
          {order.fulfillment_status === "out_for_delivery" ? <ActionForm action={transitionFulfillmentAction} orderId={order.id} field="status" value="delivered" label="Marcar entregue" /> : null}
        </div>
        {order.order_status !== "completed" && order.order_status !== "canceled" && order.order_status !== "rejected" ? (
          <form action={cancelOrderAction} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <input type="hidden" name="orderId" value={order.id} />
            <label style={{ display: "grid", gap: 5, flex: "1 1 280px" }}><strong style={{ fontSize: 13 }}>Motivo do cancelamento</strong><input name="reason" required minLength={3} maxLength={240} style={inputStyle} /></label>
            <button type="submit" style={dangerButton}>Cancelar pedido</button>
          </form>
        ) : null}
      </article>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, .6fr)", gap: 16, alignItems: "start" }}>
        <article className="card" style={{ padding: 18, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Itens</h2>
          {items.map((item) => (
            <div key={item.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>{item.quantity}× {item.product_name_snapshot}</strong><strong>{money(Number(item.line_total_cents))}</strong></div>
              {item.modifiers.length > 0 ? <div className="muted" style={{ fontSize: 12 }}>{item.modifiers.map((modifier) => modifier.modifier_name_snapshot).join(" · ")}</div> : null}
              {item.note ? <div className="muted" style={{ fontSize: 12 }}>Obs.: {item.note}</div> : null}
            </div>
          ))}
          <div style={{ display: "grid", gap: 6, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <Summary label="Subtotal" value={money(Number(order.subtotal_cents))} />
            <Summary label="Entrega" value={money(Number(order.delivery_fee_cents))} />
            <Summary label="Total" value={money(Number(order.total_cents))} strong />
            <Summary label="Pagamento" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot} />
          </div>
        </article>

        <article className="card" style={{ padding: 18, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Histórico</h2>
          {history.map((entry) => (
            <div key={entry.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 13 }}>{entry.state_domain}: {entry.from_state ?? "—"} → {entry.to_state}</strong>
              {entry.reason ? <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{entry.reason}</div> : null}
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.source}</div>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function StateCard({ label, value }: { label: string; value: string }) {
  return <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 11 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 4 }}>{value}</strong></div>;
}
function ActionForm({ action, orderId, field, value, label }: { action: (formData: FormData) => Promise<void>; orderId: string; field?: string; value?: string; label: string }) {
  return <form action={action}><input type="hidden" name="orderId" value={orderId} />{field ? <input type="hidden" name={field} value={value} /> : null}<button type="submit" style={primaryButton}>{label}</button></form>;
}
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span className="muted">{label}</span><strong style={strong ? { color: "var(--accent)", fontSize: 18 } : undefined}>{value}</strong></div>;
}
const inputStyle: React.CSSProperties = { minHeight: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" };
const primaryButton: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };
const dangerButton: React.CSSProperties = { ...primaryButton, background: "#b42318" };
