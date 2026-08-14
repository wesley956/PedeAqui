import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { PublicOrderRefresh } from "@/features/orders/public-order-refresh";
import { PublicOrderTimeline } from "@/features/orders/public-order-timeline";
import { paymentMethodLabels, type FulfillmentType } from "@/server/checkout/schemas";
import { orderCookieName } from "@/server/orders/order-token";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { orderStatusLabels, productionStatusLabels, type FulfillmentStatus, type OrderStatus, type ProductionStatus } from "@/server/orders/state-machines";
import styles from "./order-tracking.module.css";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
const paymentLabels: Record<string, string> = { pending: "Pendente", authorized: "Autorizado", paid: "Pago", failed: "Falhou", partially_refunded: "Parcialmente estornado", refunded: "Estornado" };
const fulfillmentLabels: Record<string, string> = { pending: "Aguardando operação", awaiting_assignment: "Aguardando entregador", assigned: "Entregador definido", picked_up: "Pedido retirado pelo entregador", out_for_delivery: "Saiu para entrega", delivered: "Entregue", awaiting_pickup: "Aguardando retirada", picked_up_by_customer: "Retirado", served: "Servido", canceled: "Cancelado", not_required: "Não aplicável" };

export default async function PublicOrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const accessToken = (await cookies()).get(orderCookieName(slug, id))?.value;
  if (!accessToken) notFound();
  const data = await PublicOrderService.get(slug, id, accessToken);
  if (!data) notFound();
  const { order, items, store } = data;
  const orderStatus = order.order_status as OrderStatus;
  const productionStatus = order.production_status as ProductionStatus;
  const fulfillmentStatus = order.fulfillment_status as FulfillmentStatus;
  const fulfillmentType = order.fulfillment_type as FulfillmentType;
  const terminal = orderStatus === "completed" || orderStatus === "canceled" || orderStatus === "rejected";
  const terminalProblem = orderStatus === "canceled" || orderStatus === "rejected";
  const completedFulfillment = fulfillmentStatus === "delivered" || fulfillmentStatus === "picked_up_by_customer";
  const currentLabel = terminalProblem ? orderStatusLabels[orderStatus] : fulfillmentStatus === "delivered" ? "Entregue" : fulfillmentStatus === "picked_up_by_customer" ? "Retirado" : fulfillmentStatus === "out_for_delivery" ? "Saiu para entrega" : productionStatus === "ready" ? "Pronto" : productionStatus === "preparing" || productionStatus === "queued" ? productionStatusLabels[productionStatus] : orderStatusLabels[orderStatus];
  const updatedAt = new Date(order.updated_at).toLocaleString("pt-BR");

  return <main className={styles.root}>
    {!terminal ? <PublicOrderRefresh /> : null}
    <div className={styles.container}>
      <div className={styles.topbar}><Link href={`/m/${slug}`} className={styles.back}>← Cardápio</Link><PedeAquiLogo size="xs" decorative /></div>
      <header className={`card ${styles.hero}`}>
        <span className={styles.store}>{store.name}</span>
        <div className={styles.heroRow}><h1>Pedido #{order.display_number}</h1><strong className={styles.total}>{money(Number(order.total_cents))}</strong></div>
        <div className={styles.statusLine}><span className={`${styles.status} ${terminalProblem ? styles.terminalProblem : completedFulfillment || orderStatus === "completed" ? styles.terminalSuccess : ""}`}>{currentLabel}</span><span className={styles.updated}>Atualizado em {updatedAt}</span></div>
      </header>

      <section className={`card ${styles.card}`}>
        <h2>Acompanhe seu pedido</h2>
        <PublicOrderTimeline fulfillmentType={fulfillmentType} orderStatus={orderStatus} productionStatus={productionStatus} fulfillmentStatus={fulfillmentStatus} />
        {!terminal ? <p className={styles.autoUpdate}>A página verifica atualizações automaticamente enquanto estiver visível. Você não precisa recarregar.</p> : null}
        {order.cancel_reason ? <div className={styles.cancel}><strong>Motivo:</strong> {order.cancel_reason}</div> : null}
      </section>

      <section className={`card ${styles.card}`}>
        <h2>Situação agora</h2>
        <div className={styles.statusGrid}><Status label="Produção" value={productionStatusLabels[productionStatus]}/><Status label="Pagamento" value={paymentLabels[order.payment_status] ?? order.payment_status}/><Status label={fulfillmentType === "delivery" ? "Entrega" : "Retirada"} value={fulfillmentLabels[fulfillmentStatus] ?? fulfillmentStatus}/></div>
      </section>

      <section className={`card ${styles.card}`}><h2>Itens</h2><div className={styles.items}>{items.map((item) => <div key={item.id} className={styles.item}><div className={styles.itemTop}><strong>{item.quantity}× {item.product_name_snapshot}</strong><strong>{money(Number(item.line_total_cents))}</strong></div>{item.modifiers.length > 0 ? <div className={styles.meta}>{item.modifiers.map((modifier) => modifier.modifier_name_snapshot).join(" · ")}</div> : null}{item.note ? <div className={styles.meta}>Obs.: {item.note}</div> : null}</div>)}</div></section>

      <section className={`card ${styles.card}`}><h2>Resumo</h2><div className={styles.summaryRows}><Summary label="Subtotal" value={money(Number(order.subtotal_cents))}/>{Number(order.discount_cents) > 0 ? <Summary label="Descontos" value={`− ${money(Number(order.discount_cents))}`}/> : null}<Summary label="Entrega" value={Number(order.delivery_fee_cents) > 0 ? money(Number(order.delivery_fee_cents)) : fulfillmentType === "delivery" ? "Grátis" : "Não aplicável"}/><Summary label="Total" value={money(Number(order.total_cents))} strong/><Summary label="Pagamento" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot}/>{order.cash_change_for_cents ? <Summary label="Troco para" value={money(Number(order.cash_change_for_cents))}/> : null}</div></section>

      {fulfillmentType === "delivery" ? <section className={`card ${styles.card}`}><h2>Entrega</h2><div className={styles.delivery}><span className={styles.address}>{order.address_street_snapshot}, {order.address_number_snapshot}{order.address_complement_snapshot ? ` — ${order.address_complement_snapshot}` : ""}</span><span className={styles.meta}>{order.address_district_snapshot} · {order.address_city_snapshot}/{order.address_state_snapshot}</span>{order.delivery_estimated_min_minutes !== null && order.delivery_estimated_max_minutes !== null ? <span className={styles.meta}>Estimativa registrada: {order.delivery_estimated_min_minutes}–{order.delivery_estimated_max_minutes} min</span> : null}</div></section> : fulfillmentStatus === "awaiting_pickup" ? <section className={`card ${styles.card}`}><h2>Retirada</h2><p>Seu pedido está aguardando retirada no estabelecimento.</p></section> : null}

      <div className={styles.actions}><Link href={`/m/${slug}`} className={`${styles.cta} ${terminal ? "" : styles.ctaSecondary}`}>{terminal ? "Fazer novo pedido" : "Ver cardápio"}</Link>{!terminal ? <span className={styles.cta}>Acompanhamento ativo</span> : <span className={`${styles.cta} ${styles.ctaSecondary}`}>Pedido finalizado</span>}</div>
    </div>
  </main>;
}

function Status({ label, value }: { label: string; value: string }) { return <div className={styles.statusCard}><span className={styles.statusLabel}>{label}</span><strong>{value}</strong></div>; }
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`${styles.summary} ${strong ? styles.summaryTotal : ""}`}><span>{label}</span><strong>{value}</strong></div>; }
