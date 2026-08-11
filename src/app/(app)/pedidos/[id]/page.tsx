import Link from "next/link";
import { cancelOrderAction } from "@/features/orders/actions";
import { OrderActionForm } from "@/features/orders/order-action-form";
import { OrderRealtime } from "@/features/orders/order-realtime";
import { PaymentPanel } from "@/features/payments/payment-panel";
import { OrderService } from "@/server/orders/order-service";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";
import { paymentMethodLabels } from "@/server/checkout/schemas";

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
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
const printStatusLabels: Record<string, string> = { pending: "Pendente", processing: "Imprimindo", printed: "Impresso", failed: "Falhou", cancelled: "Cancelado" };
const printDocumentLabels: Record<string, string> = { kitchen: "Cozinha", expedition: "Expedição", counter: "Balcão", receipt: "Recibo", custom: "Personalizado" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, order, items, history, printJobs } = await OrderService.get(id);
  if (!context.storeId) throw new Error("An active store is required");

  const fulfillmentComplete = ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status);
  const canComplete = order.order_status === "confirmed" && order.payment_status === "paid" && fulfillmentComplete;
  const canCancel = !["completed", "canceled", "rejected"].includes(order.order_status)
    && !["delivered", "picked_up_by_customer", "served"].includes(order.fulfillment_status);
  const fulfillmentTypeLabel = order.fulfillment_type === "delivery"
    ? "Entrega"
    : order.fulfillment_type === "counter"
      ? "Balcão"
      : "Retirada";

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1180 }}>
      <OrderRealtime storeId={context.storeId} />
      <div><Link href="/pedidos" className="muted">← Voltar ao Gestor de Pedidos</Link></div>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Pedido · {order.channel}</p>
          <h1 style={{ margin: "3px 0" }}>#{order.display_number}</h1>
          <p className="muted" style={{ margin: 0 }}>{order.customer_name_snapshot} · {fulfillmentTypeLabel} · {new Date(order.created_at).toLocaleString("pt-BR")}</p>
        </div>
        <strong style={{ fontSize: 26, color: "var(--accent)" }}>{money(order.total_cents)}</strong>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <StateCard label="Pedido" value={orderStatusLabels[order.order_status as keyof typeof orderStatusLabels]} />
        <StateCard label="Pagamento" value={paymentStatusLabels[order.payment_status] ?? order.payment_status} />
        <StateCard label="Produção" value={productionStatusLabels[order.production_status as keyof typeof productionStatusLabels]} />
        <StateCard label="Entrega/retirada" value={fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status} />
      </div>

      <article className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Ações operacionais</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>Cada botão chama o motor de estados server-side; a tela nunca grava status diretamente.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, alignItems: "start" }}>
          {order.order_status === "pending_confirmation" ? <OrderActionForm orderId={order.id} intent="accept" label="Aceitar pedido" /> : null}
          {order.order_status === "pending_confirmation" ? <OrderActionForm orderId={order.id} intent="reject" label="Recusar pedido" tone="danger" reasonLabel="Motivo da recusa" reasonPlaceholder="Ex.: item indisponível" /> : null}
          {order.order_status === "confirmed" && ["pending_confirmation", "queued"].includes(order.production_status) ? <OrderActionForm orderId={order.id} intent="start_production" label="Iniciar produção" /> : null}
          {order.production_status === "preparing" ? <OrderActionForm orderId={order.id} intent="mark_ready" label="Marcar pronto" /> : null}

          {order.production_status === "ready" && order.fulfillment_type === "pickup" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="await_pickup" label="Liberar retirada" /> : null}
          {order.fulfillment_status === "awaiting_pickup" ? <OrderActionForm orderId={order.id} intent="customer_picked_up" label="Cliente retirou" /> : null}

          {order.production_status === "ready" && order.fulfillment_type === "delivery" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="await_courier" label="Aguardar entregador" /> : null}
          {order.fulfillment_status === "awaiting_assignment" ? <OrderActionForm orderId={order.id} intent="courier_assigned" label="Confirmar entregador" /> : null}
          {order.fulfillment_status === "assigned" ? <OrderActionForm orderId={order.id} intent="courier_picked_up" label="Entregador retirou" /> : null}
          {order.fulfillment_status === "picked_up" ? <OrderActionForm orderId={order.id} intent="out_for_delivery" label="Saiu para entrega" /> : null}
          {order.fulfillment_status === "out_for_delivery" ? <OrderActionForm orderId={order.id} intent="delivered" label="Marcar entregue" /> : null}

          {order.production_status === "ready" && order.fulfillment_type === "counter" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="served" label="Marcar servido" /> : null}
          {canComplete ? <OrderActionForm orderId={order.id} intent="complete" label="Concluir pedido" /> : null}
        </div>

        {order.order_status === "confirmed" && !canComplete ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Conclusão liberada somente com pagamento pago e entrega/retirada concluída.
          </div>
        ) : null}

        {canCancel ? (
          <form action={cancelOrderAction} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <input type="hidden" name="orderId" value={order.id} />
            <label style={{ display: "grid", gap: 5, flex: "1 1 280px" }}>
              <strong style={{ fontSize: 13 }}>Motivo do cancelamento</strong>
              <input name="reason" required minLength={3} maxLength={240} style={inputStyle} />
            </label>
            <button type="submit" style={dangerButton}>Cancelar pedido</button>
          </form>
        ) : null}
      </article>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, .65fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <article className="card" style={{ padding: 18, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Itens e valores</h2>
            {items.map((item) => (
              <div key={item.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>{item.quantity}× {item.product_name_snapshot}</strong><strong>{money(item.line_total_cents)}</strong></div>
                {item.modifiers.length > 0 ? <div className="muted" style={{ fontSize: 12 }}>{item.modifiers.map((modifier) => `${modifier.modifier_name_snapshot}${Number(modifier.unit_price_cents) > 0 ? ` (+${money(modifier.unit_price_cents)})` : ""}`).join(" · ")}</div> : null}
                {item.note ? <div className="muted" style={{ fontSize: 12 }}>Obs.: {item.note}</div> : null}
              </div>
            ))}
            <div style={{ display: "grid", gap: 6, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <Summary label="Subtotal" value={money(order.subtotal_cents)} />
              {Number(order.discount_cents) > 0 ? <Summary label="Desconto" value={`-${money(order.discount_cents)}`} /> : null}
              <Summary label="Entrega" value={money(order.delivery_fee_cents)} />
              <Summary label="Total" value={money(order.total_cents)} strong />
              <Summary label="Pagamento" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot} />
              {order.cash_change_for_cents ? <Summary label="Troco para" value={money(order.cash_change_for_cents)} /> : null}
            </div>
          </article>

          <PaymentPanel orderId={order.id} />

          <article className="card" style={{ padding: 18, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Impressões</h2>
            {printJobs.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhuma via roteada para este pedido.</p> : printJobs.map((job) => (
              <div key={job.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", display: "grid", gap: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{printDocumentLabels[job.document_type] ?? job.document_type}{job.is_reprint ? " · REIMPRESSÃO" : ""}</strong>
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{job.station_name} → {job.printer_name} · {printStatusLabels[job.status] ?? job.status} · {job.copies} cópia(s)</div>
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>tentativa {job.attempts}/{job.max_attempts}</span>
                </div>
                {job.last_error ? <div style={{ color: "#f97066", fontSize: 11 }}>{job.last_error}</div> : null}
                {["printed", "failed"].includes(job.status) ? <OrderActionForm orderId={order.id} intent="reprint" printJobId={job.id} label="Reimprimir via" tone="secondary" reasonLabel="Motivo da reimpressão" reasonPlaceholder="Ex.: via danificada" compact /> : null}
              </div>
            ))}
          </article>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <article className="card" style={{ padding: 18, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Cliente e atendimento</h2>
            <Info label="Cliente" value={order.customer_name_snapshot} />
            <Info label="Telefone" value={order.customer_phone_snapshot ?? "Não informado"} />
            <Info label="Modalidade" value={fulfillmentTypeLabel} />
            {order.fulfillment_type === "delivery" ? (
              <>
                <Info label="Endereço" value={[order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ") || "Não informado"} />
                <Info label="Bairro" value={order.address_district_snapshot ?? "—"} />
                <Info label="Cidade" value={[order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/") || "—"} />
                {order.address_reference_snapshot ? <Info label="Referência" value={order.address_reference_snapshot} /> : null}
              </>
            ) : null}
            <Info label="Criado" value={new Date(order.created_at).toLocaleString("pt-BR")} />
            {order.confirmed_at ? <Info label="Confirmado" value={new Date(order.confirmed_at).toLocaleString("pt-BR")} /> : null}
            {order.completed_at ? <Info label="Concluído" value={new Date(order.completed_at).toLocaleString("pt-BR")} /> : null}
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
      </div>
    </section>
  );
}

function StateCard({ label, value }: { label: string; value: string }) {
  return <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 11 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 4 }}>{value}</strong></div>;
}
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span className="muted">{label}</span><strong style={strong ? { color: "var(--accent)", fontSize: 18 } : undefined}>{value}</strong></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><span className="muted" style={{ fontSize: 11 }}>{label.toUpperCase()}</span><div style={{ marginTop: 3 }}>{value}</div></div>;
}
const inputStyle: React.CSSProperties = { minHeight: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" };
const primaryButton: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };
const dangerButton: React.CSSProperties = { ...primaryButton, background: "#b42318" };