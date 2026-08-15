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
  pending: "Aguardando",
  awaiting_assignment: "Aguardando entregador",
  assigned: "Entregador definido",
  picked_up: "Com o entregador",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  awaiting_pickup: "Pronto para retirada",
  picked_up_by_customer: "Retirado",
  served: "Servido",
  canceled: "Cancelado",
  not_required: "Não aplicável",
};

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
  const currentLabel = terminalProblem
    ? orderStatusLabels[orderStatus]
    : fulfillmentStatus === "delivered"
      ? "Entregue"
      : fulfillmentStatus === "picked_up_by_customer"
        ? "Retirado"
        : fulfillmentStatus === "out_for_delivery"
          ? "Saiu para entrega"
          : productionStatus === "ready"
            ? fulfillmentType === "delivery" ? "Pronto para sair" : "Pronto para retirada"
            : productionStatus === "preparing" || productionStatus === "queued"
              ? productionStatusLabels[productionStatus]
              : orderStatusLabels[orderStatus];
  const updatedAt = new Date(order.updated_at).toLocaleString("pt-BR");
  const estimate = order.delivery_estimated_min_minutes !== null && order.delivery_estimated_max_minutes !== null
    ? `${order.delivery_estimated_min_minutes}–${order.delivery_estimated_max_minutes} min`
    : fulfillmentType === "pickup" ? "Retirada no local" : null;
  const heroTitle = terminalProblem
    ? "Não foi possível concluir este pedido"
    : completedFulfillment || orderStatus === "completed"
      ? "Pedido concluído!"
      : "Pedido recebido!";
  const heroMessage = terminalProblem
    ? "Confira o motivo abaixo. Se precisar, entre em contato com o restaurante."
    : completedFulfillment || orderStatus === "completed"
      ? "Obrigado pelo pedido. Esperamos atender você novamente em breve."
      : "O restaurante já recebeu seu pedido. Você pode acompanhar tudo por esta página.";

  return (
    <main className={styles.root}>
      {!terminal ? <PublicOrderRefresh /> : null}
      <div className={styles.container}>
        <div className={styles.topbar}>
          <Link href={`/m/${slug}`} className={styles.back}>← Cardápio</Link>
          <PedeAquiLogo size="xs" decorative />
        </div>

        <header className={`card ${styles.hero}`}>
          <div className={`${styles.successIcon} ${terminalProblem ? styles.problemIcon : ""}`}>{terminalProblem ? "!" : "✓"}</div>
          <span className={styles.store}>{store.name}</span>
          <h1>{heroTitle}</h1>
          <p className={styles.heroMessage}>{heroMessage}</p>
          <span className={`${styles.status} ${terminalProblem ? styles.terminalProblem : completedFulfillment || orderStatus === "completed" ? styles.terminalSuccess : ""}`}>{currentLabel}</span>
          {estimate && !terminalProblem ? <div className={styles.estimate}><span>{fulfillmentType === "delivery" ? "Previsão registrada" : "Recebimento"}</span><strong>{estimate}</strong></div> : null}
          <div className={styles.updated}>Pedido #{order.display_number} · atualizado em {updatedAt}</div>
        </header>

        <section className={`card ${styles.card}`}>
          <div className={styles.cardHead}><h2>Acompanhe seu pedido</h2>{!terminal ? <span className={styles.autoUpdate}>Atualização automática</span> : null}</div>
          <PublicOrderTimeline fulfillmentType={fulfillmentType} orderStatus={orderStatus} productionStatus={productionStatus} fulfillmentStatus={fulfillmentStatus} />
          {order.cancel_reason ? <div className={styles.cancel}><strong>Motivo:</strong> {order.cancel_reason}</div> : null}
        </section>

        <section className={`card ${styles.card}`}>
          <div className={styles.cardHead}><h2>Situação agora</h2><strong>{money(Number(order.total_cents))}</strong></div>
          <div className={styles.statusStrip}>
            <Status label="Produção" value={productionStatusLabels[productionStatus]} />
            <Status label="Pagamento" value={paymentLabels[order.payment_status] ?? order.payment_status} />
            <Status label={fulfillmentType === "delivery" ? "Entrega" : "Retirada"} value={fulfillmentLabels[fulfillmentStatus] ?? fulfillmentStatus} />
          </div>
        </section>

        {fulfillmentType === "delivery" ? (
          <section className={`card ${styles.card}`}>
            <h2>Entrega</h2>
            <div className={styles.delivery}>
              <span className={styles.address}>{order.address_street_snapshot}, {order.address_number_snapshot}{order.address_complement_snapshot ? ` — ${order.address_complement_snapshot}` : ""}</span>
              <span className={styles.meta}>{order.address_district_snapshot} · {order.address_city_snapshot}/{order.address_state_snapshot}</span>
            </div>
          </section>
        ) : fulfillmentStatus === "awaiting_pickup" ? (
          <section className={`card ${styles.card}`}><h2>Retirada</h2><p>Seu pedido está pronto e aguardando você no estabelecimento.</p></section>
        ) : null}

        <details className={styles.compact}>
          <summary><span>Ver itens do pedido</span><span>{items.length} item(ns)</span></summary>
          <div className={styles.compactBody}>
            <div className={styles.items}>
              {items.map((item) => (
                <div key={item.id} className={styles.item}>
                  <div className={styles.itemTop}><strong>{item.quantity}× {item.product_name_snapshot}</strong><strong>{money(Number(item.line_total_cents))}</strong></div>
                  {item.modifiers.length > 0 ? <div className={styles.meta}>{item.modifiers.map((modifier) => modifier.modifier_name_snapshot).join(" · ")}</div> : null}
                  {item.note ? <div className={styles.meta}>Obs.: {item.note}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className={styles.compact}>
          <summary><span>Valores e pagamento</span><strong>{money(Number(order.total_cents))}</strong></summary>
          <div className={styles.compactBody}>
            <div className={styles.summaryRows}>
              <Summary label="Subtotal" value={money(Number(order.subtotal_cents))} />
              {Number(order.discount_cents) > 0 ? <Summary label="Descontos" value={`− ${money(Number(order.discount_cents))}`} /> : null}
              <Summary label="Entrega" value={Number(order.delivery_fee_cents) > 0 ? money(Number(order.delivery_fee_cents)) : fulfillmentType === "delivery" ? "Grátis" : "Não aplicável"} />
              <Summary label="Total" value={money(Number(order.total_cents))} strong />
              <Summary label="Pagamento" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot} />
              {order.cash_change_for_cents ? <Summary label="Troco para" value={money(Number(order.cash_change_for_cents))} /> : null}
            </div>
          </div>
        </details>

        <div className={styles.actions}>
          <Link href={`/m/${slug}`} className={styles.cta}>{terminal ? "Fazer novo pedido" : "Voltar ao cardápio"}</Link>
          <span className={`${styles.cta} ${styles.ctaSecondary}`}>{terminal ? "Pedido finalizado" : "Acompanhamento ativo"}</span>
        </div>
      </div>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <div className={styles.statusCard}><span className={styles.statusLabel}>{label}</span><strong>{value}</strong></div>;
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`${styles.summary} ${strong ? styles.summaryTotal : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
