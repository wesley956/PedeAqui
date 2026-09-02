import Link from "next/link";
import { OrderActionForm } from "@/features/orders/order-action-form";
import { OrderRealtime } from "@/features/orders/order-realtime";
import { PaymentPanel } from "@/features/payments/payment-panel";
import { SemanticStatus, type StatusTone } from "@/components/ui/status";
import { isManualDeliveryMode } from "@/modules/manual-delivery";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";
import { OrderService } from "@/server/orders/order-service";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import styles from "./order-detail.module.css";

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
const historyDomainLabels: Record<string, string> = { order: "Pedido", production: "Produção", fulfillment: "Entrega/retirada", payment: "Pagamento" };
const historySourceLabels: Record<string, string> = { panel: "Painel", checkout: "Cardápio", system: "Sistema", integration: "Integração", automation: "Automação", pdv: "PDV" };

function dateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(value));
}
function historyState(domain: string, state: string | null) {
  if (!state) return "início";
  if (domain === "order") return orderStatusLabels[state as keyof typeof orderStatusLabels] ?? state;
  if (domain === "production") return productionStatusLabels[state as keyof typeof productionStatusLabels] ?? state;
  if (domain === "payment") return paymentStatusLabels[state] ?? state;
  if (domain === "fulfillment") return fulfillmentLabels[state] ?? state;
  return state;
}

function toneForOrder(status: string): StatusTone {
  if (["canceled", "rejected"].includes(status)) return "danger";
  if (status === "completed") return "success";
  if (status === "confirmed") return "info";
  return "warning";
}
function toneForPayment(status: string): StatusTone {
  if (status === "paid") return "success";
  if (status === "failed") return "danger";
  if (["refunded", "partially_refunded"].includes(status)) return "neutral";
  return "warning";
}
function toneForProduction(status: string): StatusTone {
  if (status === "ready") return "success";
  if (status === "preparing") return "warning";
  if (status === "canceled") return "danger";
  return "neutral";
}
function toneForFulfillment(status: string): StatusTone {
  if (["delivered", "picked_up_by_customer", "served", "not_required"].includes(status)) return "success";
  if (["assigned", "picked_up", "out_for_delivery", "awaiting_pickup"].includes(status)) return "info";
  if (status === "canceled") return "danger";
  return "neutral";
}

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const requestedReturn = (await searchParams).from ?? "";
  const returnTo = requestedReturn === "/pedidos" || requestedReturn.startsWith("/pedidos/historico?") || requestedReturn === "/pedidos/historico" ? requestedReturn : "/pedidos";
  const { context, order, items, history, printJobs, timeZone } = await OrderService.get(id);
  if (!context.storeId) throw new Error("An active store is required");
  const [moduleSnapshot, operational] = await Promise.all([ModuleAccessService.load(context), OperationalSettingsService.loadCurrent()]);
  const manualDeliveryMode = isManualDeliveryMode(moduleSnapshot.enabledModuleKeys, operational.settings.deliveryOperationLevel);

  const fulfillmentComplete = ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status);
  const canComplete = order.order_status === "confirmed" && ["paid", "partially_refunded", "refunded"].includes(order.payment_status) && fulfillmentComplete;
  const canCancel = !["completed", "canceled", "rejected"].includes(order.order_status)
    && !["delivered", "picked_up_by_customer", "served"].includes(order.fulfillment_status);
  const fulfillmentTypeLabel = order.fulfillment_type === "delivery" ? "Entrega"
    : order.fulfillment_type === "counter" ? "Balcão"
      : ["table", "dine_in"].includes(order.fulfillment_type) ? "Mesa" : "Retirada";
  const channelLabel = order.channel === "digital_menu" || order.channel === "menu" ? "Cardápio"
    : order.channel === "table_qr" || order.channel === "dining" ? "Salão"
      : order.channel === "pdv" ? "PDV" : order.channel;
  const canManualDispatch = manualDeliveryMode
    && order.order_status === "confirmed"
    && ["ready", "not_required"].includes(order.production_status)
    && order.fulfillment_type === "delivery"
    && ["pending", "awaiting_assignment", "assigned", "picked_up"].includes(order.fulfillment_status);
  const canManualFinish = manualDeliveryMode
    && order.order_status === "confirmed"
    && order.fulfillment_type === "delivery"
    && order.fulfillment_status === "out_for_delivery";
  const operationalImpacts = [
    printJobs.some((job) => job.status === "failed") ? { title: "Impressão requer atenção", detail: "A cozinha pode não ter recebido uma via. Confira a impressora e reenvie em Impressões." } : null,
    fulfillmentComplete && order.payment_status === "pending" ? { title: "Pagamento ainda pendente", detail: operational.settings.paymentCompletionPolicy === "flexible" ? "A operação terminou, mas o valor continuará na fila do Financeiro até a baixa." : "Confirme o recebimento para liberar a conclusão do pedido." } : null,
    order.production_status === "preparing" ? { title: "Pedido em preparo", detail: "A próxima ação é marcar como pronto quando a cozinha terminar." } : null,
    !manualDeliveryMode && order.fulfillment_status === "awaiting_assignment" ? { title: "Entrega sem responsável", detail: "Escolha o entregador na Central de Entregas para o pedido seguir." } : null,
  ].filter((impact): impact is { title: string; detail: string } => Boolean(impact));

  return (
    <section className={styles.page}>
      <OrderRealtime storeId={context.storeId} />
      <Link href={returnTo} className={styles.back}>← Voltar sem perder sua posição</Link>

      <article className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.eyebrow}>{channelLabel} · {fulfillmentTypeLabel}</p>
            <h1 className={styles.title}>Pedido #{order.display_number}</h1>
            <p className={styles.meta}>{order.customer_name_snapshot} · {dateTime(order.created_at, timeZone)}</p>
            {order.scheduled_for ? <p className={styles.meta}><strong>Agendado para {dateTime(order.scheduled_for, timeZone)}</strong></p> : null}
          </div>
          <div className={styles.total}>{money(order.total_cents)}</div>
        </div>

        <div className={styles.statusGrid} aria-label="Situação atual do pedido">
          <StatusItem label="Pedido" value={orderStatusLabels[order.order_status as keyof typeof orderStatusLabels]} tone={toneForOrder(order.order_status)} />
          <StatusItem label="Pagamento" value={paymentStatusLabels[order.payment_status] ?? order.payment_status} tone={toneForPayment(order.payment_status)} />
          <StatusItem label="Produção" value={productionStatusLabels[order.production_status as keyof typeof productionStatusLabels]} tone={toneForProduction(order.production_status)} />
          <StatusItem label="Entrega/retirada" value={fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status} tone={toneForFulfillment(order.fulfillment_status)} />
        </div>
        {order.cancel_reason ? <p className={styles.completionHint}><strong>Motivo do cancelamento:</strong> {order.cancel_reason}</p> : null}
        {operationalImpacts.map((impact) => <p key={impact.title} className={styles.completionHint}><strong>{impact.title}:</strong> {impact.detail}</p>)}

        <div className={styles.nextAction}>
          <div>
            <h2 className={styles.sectionHeading}>Próxima ação</h2>
            <p className={styles.sectionHint}>Ações exibidas somente quando a transição atual é permitida pelo fluxo existente.</p>
          </div>
          <div className={styles.actionGrid}>
            {order.order_status === "pending_confirmation" ? <OrderActionForm orderId={order.id} intent="accept" label="Aceitar pedido" /> : null}
            {order.order_status === "confirmed" && ["pending_confirmation", "queued"].includes(order.production_status) ? <OrderActionForm orderId={order.id} intent="start_production" label="Iniciar produção" /> : null}
            {order.production_status === "preparing" ? <OrderActionForm orderId={order.id} intent="mark_ready" label="Marcar pronto" /> : null}
            {order.production_status === "ready" && order.fulfillment_type === "pickup" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="await_pickup" label="Liberar retirada" /> : null}
            {order.fulfillment_status === "awaiting_pickup" ? <OrderActionForm orderId={order.id} intent="customer_picked_up" label="Cliente retirou" /> : null}
            {canManualDispatch ? <OrderActionForm orderId={order.id} intent="manual_out_for_delivery" label="Saiu para entrega" /> : null}
            {canManualFinish ? <OrderActionForm orderId={order.id} intent="manual_finish_delivery" label={operational.settings.paymentCompletionPolicy === "quick_confirmation" ? "Receber e finalizar" : "Finalizar pedido"} confirmPayment={operational.settings.paymentCompletionPolicy === "quick_confirmation"} /> : null}
            {!manualDeliveryMode && order.production_status === "ready" && order.fulfillment_type === "delivery" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="await_courier" label="Aguardar entregador" /> : null}
            {!manualDeliveryMode && order.fulfillment_status === "awaiting_assignment" ? <OrderActionForm orderId={order.id} intent="courier_assigned" label="Confirmar entregador" /> : null}
            {!manualDeliveryMode && order.fulfillment_status === "assigned" ? <OrderActionForm orderId={order.id} intent="courier_picked_up" label="Entregador retirou" /> : null}
            {!manualDeliveryMode && order.fulfillment_status === "picked_up" ? <OrderActionForm orderId={order.id} intent="out_for_delivery" label="Saiu para entrega" /> : null}
            {!manualDeliveryMode && order.fulfillment_status === "out_for_delivery" ? <OrderActionForm orderId={order.id} intent="delivered" label="Marcar entregue" /> : null}
            {order.production_status === "ready" && order.fulfillment_type === "counter" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="served" label="Marcar servido" /> : null}
            {order.fulfillment_status === "delivered" && order.payment_status === "pending" ? <OrderActionForm orderId={order.id} intent="mark_paid" label="Marcar pago" tone="secondary" /> : null}
            {canComplete ? <OrderActionForm orderId={order.id} intent="complete" label="Concluir pedido" /> : null}
          </div>
          {manualDeliveryMode && order.fulfillment_type === "delivery" && order.fulfillment_status === "out_for_delivery"
            ? <p className={styles.completionHint}>“Saiu para entrega” significa que o pedido está em rota. Use “Finalizar pedido” somente quando o cliente tiver recebido.</p>
            : order.order_status === "confirmed" && !canComplete
              ? <p className={styles.completionHint}>Conclusão liberada somente com pagamento pago e entrega/retirada concluída.</p>
              : null}
        </div>
      </article>

      <div className={styles.mainGrid}>
        <div className={styles.stack}>
          <article className={styles.panel}>
            <h2>Itens do pedido</h2>
            {items.map((item) => (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemMain}><strong>{item.quantity}× {item.product_name_snapshot}</strong><strong>{money(item.line_total_cents)}</strong></div>
                {item.modifiers.length > 0 ? <div className={styles.itemMeta}>{item.modifiers.map((modifier) => `${modifier.modifier_name_snapshot}${Number(modifier.unit_price_cents) > 0 ? ` (+${money(modifier.unit_price_cents)})` : ""}`).join(" · ")}</div> : null}
                {item.note ? <div className={styles.itemMeta}><strong>Observação:</strong> {item.note}</div> : null}
              </div>
            ))}
            <div className={styles.summaryList}>
              <Summary label="Subtotal" value={money(order.subtotal_cents)} />
              {Number(order.coupon_discount_cents) > 0 ? <Summary label={`Cupom${order.coupon_code_snapshot ? ` ${order.coupon_code_snapshot}` : ""}`} value={`-${money(order.coupon_discount_cents)}`} /> : null}
              {Number(order.cashback_discount_cents) > 0 ? <Summary label="Cashback" value={`-${money(order.cashback_discount_cents)}`} /> : null}
              {Number(order.loyalty_discount_cents) > 0 ? <Summary label="Fidelidade" value={`-${money(order.loyalty_discount_cents)}`} /> : null}
              {Number(order.discount_cents) > 0 && Number(order.coupon_discount_cents) + Number(order.cashback_discount_cents) + Number(order.loyalty_discount_cents) === 0 ? <Summary label="Desconto" value={`-${money(order.discount_cents)}`} /> : null}
              <Summary label="Entrega" value={money(order.delivery_fee_cents)} />
              <Summary label="Total" value={money(order.total_cents)} strong />
            </div>
          </article>

          <PaymentPanel orderId={order.id} timeZone={timeZone} />
        </div>

        <div className={styles.stack}>
          <article className={styles.panel}>
            <h2>Cliente e atendimento</h2>
            <div className={styles.infoGrid}>
              <Info label="Cliente" value={order.customer_name_snapshot} full />
              <Info label="Telefone" value={order.customer_phone_snapshot ?? "Não informado"} />
              <Info label="E-mail" value={order.customer_email_snapshot ?? "Não informado"} />
              <Info label="Modalidade" value={fulfillmentTypeLabel} />
              {order.fulfillment_type === "delivery" ? <>
                <Info label="Endereço" value={[order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ") || "Não informado"} full />
                {order.address_complement_snapshot ? <Info label="Complemento" value={order.address_complement_snapshot} full /> : null}
                <Info label="Bairro" value={order.address_district_snapshot ?? "—"} />
                <Info label="Cidade" value={[order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/") || "—"} />
                <Info label="CEP" value={order.address_postal_code_snapshot ?? "—"} />
                {order.address_reference_snapshot ? <Info label="Referência" value={order.address_reference_snapshot} full /> : null}
              </> : null}
            </div>
          </article>

          <article className={styles.panel}>
            <h2>Pagamento resumido</h2>
            <div className={styles.summaryList}>
              <Summary label="Forma" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot} />
              <Summary label="Situação" value={paymentStatusLabels[order.payment_status] ?? order.payment_status} />
              {order.cash_change_for_cents ? <Summary label="Troco para" value={money(order.cash_change_for_cents)} /> : null}
            </div>
          </article>
        </div>
      </div>

      <section className={styles.secondary} aria-label="Informações secundárias do pedido">
        <details>
          <summary>Histórico do pedido ({history.length})</summary>
          <div className={styles.detailsBody}>
            {history.length === 0 ? <p className={styles.small}>Nenhuma movimentação registrada.</p> : history.map((entry) => (
              <div key={entry.id} className={styles.historyEntry}>
                <strong>{historyDomainLabels[entry.state_domain] ?? "Atualização"}: {historyState(entry.state_domain, entry.from_state)} → {historyState(entry.state_domain, entry.to_state)}</strong>
                {entry.reason ? <div className={styles.small}>{entry.reason}</div> : null}
                <div className={styles.small}>{dateTime(entry.created_at, timeZone)} · {historySourceLabels[entry.source] ?? "Sistema"}</div>
              </div>
            ))}
          </div>
        </details>

        <details>
          <summary>Impressões ({printJobs.length})</summary>
          <div className={styles.detailsBody}>
            {order.order_status === "confirmed" ? <OrderActionForm orderId={order.id} intent="print" label="Imprimir pedido" tone="secondary" compact /> : null}
            {printJobs.length === 0 ? <p className={styles.small}>Nenhuma via roteada para este pedido.</p> : printJobs.map((job) => (
              <div key={job.id} className={styles.printEntry}>
                <strong>{job.station_name}{job.is_reprint ? " · Reimpressão" : ""}</strong>
                <div className={styles.small}>{job.printer_name} · {printStatusLabels[job.status] ?? job.status} · {job.copies} cópia(s)</div>
                <div className={styles.small}>Solicitada em {dateTime(job.created_at, timeZone)}{job.printed_at ? ` · impressa em ${dateTime(job.printed_at, timeZone)}` : ""}</div>
                {job.last_error ? <div className={styles.error}>Falha ao imprimir. Verifique o agente e a impressora antes de tentar novamente.</div> : null}
                {["printed", "failed"].includes(job.status) ? <OrderActionForm orderId={order.id} intent="reprint" printJobId={job.id} label="Reimprimir via" tone="secondary" reasonLabel="Motivo da reimpressão" reasonPlaceholder="Ex.: via danificada" compact /> : null}
              </div>
            ))}
          </div>
        </details>
      </section>

      {canCancel ? (
        <section className={styles.admin} aria-labelledby="order-admin-heading">
          <div>
            <h2 id="order-admin-heading" className={styles.sectionHeading}>Ações administrativas</h2>
            <p className={styles.sectionHint}>Use cancelamento somente quando necessário; a regra de autorização permanece no servidor.</p>
          </div>
          <div className={styles.cancelForm}>
            {order.order_status === "pending_confirmation"
              ? <OrderActionForm orderId={order.id} intent="reject" label="Recusar pedido" tone="danger" reasonLabel="Motivo da recusa" reasonPlaceholder="Ex.: item indisponível" />
              : <OrderActionForm orderId={order.id} intent="cancel" label="Cancelar pedido" tone="danger" reasonLabel="Motivo do cancelamento" reasonPlaceholder="Ex.: cliente solicitou cancelamento" />}
          </div>
        </section>
      ) : null}
      <p className={styles.small}>Última atualização: {dateTime(order.updated_at, timeZone)}</p>
    </section>
  );
}

function StatusItem({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  const icon = tone === "success" ? "✓" : tone === "danger" ? "×" : tone === "warning" ? "!" : tone === "info" ? "→" : "○";
  return <div className={styles.statusItem}><span className={styles.statusLabel}>{label}</span><SemanticStatus tone={tone} label={value} icon={icon} /></div>;
}
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`${styles.summary} ${strong ? styles.summaryStrong : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Info({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return <div className={`${styles.info} ${full ? styles.full : ""}`}><span className={styles.infoLabel}>{label}</span><div className={styles.infoValue}>{value}</div></div>;
}
