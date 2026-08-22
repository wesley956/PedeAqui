import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { PublicOrderRefresh } from "@/features/orders/public-order-refresh";
import { PublicOrderTimeline } from "@/features/orders/public-order-timeline";
import { PixCopyButton } from "@/features/payments/pix-copy-button";
import { businessVocabulary, productionStatusLabelForBusiness } from "@/modules/business-vocabulary";
import { isBusinessType } from "@/modules/module-catalog";
import { paymentMethodLabels, type FulfillmentType } from "@/server/checkout/schemas";
import { orderCookieName } from "@/server/orders/order-token";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { orderStatusLabels, type FulfillmentStatus, type OrderStatus, type ProductionStatus } from "@/server/orders/state-machines";
import styles from "./order-tracking.module.css";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

const paymentLabels: Record<string, string> = {
  pending: "Pendente", authorized: "Autorizado", paid: "Pago", failed: "Falhou", partially_refunded: "Parcialmente estornado", refunded: "Estornado",
};
const fulfillmentLabels: Record<string, string> = {
  pending: "Aguardando", awaiting_assignment: "Aguardando entregador", assigned: "Entregador definido", picked_up: "Com o entregador", out_for_delivery: "Saiu para entrega",
  delivered: "Entregue", awaiting_pickup: "Pronto para retirada", picked_up_by_customer: "Retirado", served: "Servido", canceled: "Cancelado", not_required: "Não aplicável",
};

export default async function PublicOrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const accessToken = (await cookies()).get(orderCookieName(slug, id))?.value;
  if (!accessToken) notFound();
  const data = await PublicOrderService.get(slug, id, accessToken);
  if (!data) notFound();

  const { order, items, store, pixPayment } = data;
  const businessType = isBusinessType(store.business_type ?? "") ? store.business_type : "restaurant";
  const vocabulary = businessVocabulary(businessType);
  const orderStatus = order.order_status as OrderStatus;
  const productionStatus = order.production_status as ProductionStatus;
  const fulfillmentStatus = order.fulfillment_status as FulfillmentStatus;
  const fulfillmentType = order.fulfillment_type as FulfillmentType;
  const terminal = orderStatus === "completed" || orderStatus === "canceled" || orderStatus === "rejected";
  const terminalProblem = orderStatus === "canceled" || orderStatus === "rejected";
  const completedFulfillment = fulfillmentStatus === "delivered" || fulfillmentStatus === "picked_up_by_customer";
  const currentLabel = terminalProblem
    ? orderStatusLabels[orderStatus]
    : fulfillmentStatus === "delivered" ? "Entregue"
      : fulfillmentStatus === "picked_up_by_customer" ? "Retirado"
        : fulfillmentStatus === "out_for_delivery" ? "Saiu para entrega"
          : productionStatus === "ready" ? fulfillmentType === "delivery" ? `${vocabulary.readyLabel} para sair` : `${vocabulary.readyLabel} para retirada`
            : productionStatus === "preparing" || productionStatus === "queued" ? productionStatusLabelForBusiness(productionStatus, businessType)
              : orderStatusLabels[orderStatus];
  const updatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: store.timezone || "America/Sao_Paulo" }).format(new Date(order.updated_at));
  const estimate = order.delivery_estimated_min_minutes !== null && order.delivery_estimated_max_minutes !== null
    ? `${order.delivery_estimated_min_minutes}–${order.delivery_estimated_max_minutes} min`
    : fulfillmentType === "pickup" ? "Retirada no local" : null;
  const scheduledLabel = order.scheduled_for
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: store.timezone || "America/Sao_Paulo" }).format(new Date(order.scheduled_for))
    : null;
  const heroTitle = terminalProblem ? "Não foi possível concluir este pedido" : completedFulfillment || orderStatus === "completed" ? "Pedido concluído!" : "Pedido recebido!";
  const heroMessage = terminalProblem
    ? `Confira o motivo abaixo. Se precisar, entre em contato com a ${vocabulary.unitLabel}.`
    : completedFulfillment || orderStatus === "completed" ? "Obrigado pelo pedido. Esperamos atender você novamente em breve."
      : `A ${vocabulary.unitLabel} já recebeu seu pedido. Você pode acompanhar tudo por esta página.`;

  return <main className={styles.root}>
    {!terminal ? <PublicOrderRefresh /> : null}
    <div className={styles.container}>
      <div className={styles.topbar}><Link href={`/m/${slug}`} className={styles.back}>← {vocabulary.catalogLabel}</Link><PedeAquiLogo size="xs" decorative /></div>

      <header className={`card ${styles.hero}`}>
        <div className={`${styles.successIcon} ${terminalProblem ? styles.problemIcon : ""}`}>{terminalProblem ? "!" : "✓"}</div>
        <span className={styles.store}>{store.name}</span><h1>{heroTitle}</h1><p className={styles.heroMessage}>{heroMessage}</p>
        <span className={`${styles.status} ${terminalProblem ? styles.terminalProblem : completedFulfillment || orderStatus === "completed" ? styles.terminalSuccess : ""}`}>{currentLabel}</span>
        {estimate && !terminalProblem ? <div className={styles.estimate}><span>{fulfillmentType === "delivery" ? "Previsão registrada" : "Recebimento"}</span><strong>{estimate}</strong></div> : null}
        {scheduledLabel && !terminalProblem ? <div className={styles.estimate}><span>Horário solicitado</span><strong>{scheduledLabel}</strong></div> : null}
        <div className={styles.updated}>Pedido #{order.display_number} · atualizado em {updatedAt}</div>
      </header>

      {pixPayment ? <section className={`card ${styles.card}`} style={{ textAlign: "center", display: "grid", gap: 14, justifyItems: "center" }}>
        {pixPayment.status === "paid" || order.payment_status === "paid" ? <><h2 style={{ marginBottom: 0 }}>Pix confirmado ✓</h2><p className="muted" style={{ margin: 0 }}>O pagamento de {money(pixPayment.amountCents)} já foi confirmado automaticamente.</p></>
          : pixPayment.status === "waiting" && pixPayment.qrCode ? <>
            <div><p className="muted" style={{ margin: 0, fontSize: 12 }}>PAGAMENTO PIX</p><h2 style={{ margin: "4px 0" }}>Escaneie o QR Code</h2><p className="muted" style={{ margin: 0 }}>Valor exato: <strong>{money(pixPayment.amountCents)}</strong></p></div>
            {pixPayment.qrCodeBase64 ? <Image src={`data:image/png;base64,${pixPayment.qrCodeBase64}`} alt="QR Code Pix do pedido" width={240} height={240} unoptimized style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }} /> : null}
            <div style={{ width: "100%", display: "grid", gap: 8 }}><label htmlFor="pix-code" style={{ fontWeight: 600 }}>Pix Copia e Cola</label><textarea id="pix-code" value={pixPayment.qrCode} readOnly rows={3} style={{ width: "100%", resize: "none" }} /><PixCopyButton code={pixPayment.qrCode} /></div>
            {pixPayment.expiresAt ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Este QR Code é temporário. Se expirar, a página gera uma nova cobrança segura.</p> : null}
          </> : pixPayment.status === "unavailable" ? <><h2 style={{ marginBottom: 0 }}>Pix temporariamente indisponível</h2><p className="muted" style={{ margin: 0 }}>Seu pedido foi registrado. Esta página tentará gerar o Pix novamente sem duplicar a cobrança.</p></>
            : <><h2 style={{ marginBottom: 0 }}>Preparando seu Pix…</h2><p className="muted" style={{ margin: 0 }}>Aguarde a atualização automática desta página. Não é necessário refazer o pedido.</p></>}
      </section> : null}

      <section className={`card ${styles.card}`}>
        <div className={styles.cardHead}><h2>Acompanhe seu pedido</h2>{!terminal ? <span className={styles.autoUpdate}>Atualização automática</span> : null}</div>
        <PublicOrderTimeline fulfillmentType={fulfillmentType} orderStatus={orderStatus} productionStatus={productionStatus} fulfillmentStatus={fulfillmentStatus} businessType={businessType} />
        {order.cancel_reason ? <div className={styles.cancel}><strong>Motivo:</strong> {order.cancel_reason}</div> : null}
      </section>

      <section className={`card ${styles.card}`}>
        <div className={styles.cardHead}><h2>Situação agora</h2><strong>{money(Number(order.total_cents))}</strong></div>
        <div className={styles.statusStrip}>
          <Status label={vocabulary.productionLabel} value={productionStatusLabelForBusiness(productionStatus, businessType)} />
          <Status label="Pagamento" value={paymentLabels[order.payment_status] ?? order.payment_status} />
          <Status label={fulfillmentType === "delivery" ? "Entrega" : "Retirada"} value={fulfillmentLabels[fulfillmentStatus] ?? fulfillmentStatus} />
        </div>
      </section>

      {fulfillmentType === "delivery" ? <section className={`card ${styles.card}`}><h2>Entrega</h2><div className={styles.delivery}><span className={styles.address}>{order.address_street_snapshot}, {order.address_number_snapshot}{order.address_complement_snapshot ? ` — ${order.address_complement_snapshot}` : ""}</span><span className={styles.meta}>{order.address_district_snapshot} · {order.address_city_snapshot}/{order.address_state_snapshot}</span></div></section>
        : fulfillmentStatus === "awaiting_pickup" ? <section className={`card ${styles.card}`}><h2>Retirada</h2><p>Seu pedido está pronto e aguardando você no estabelecimento.</p></section> : null}

      <details className={styles.compact}>
        <summary><span>Ver itens do pedido</span><span>{items.length} item(ns)</span></summary>
        <div className={styles.compactBody}><div className={styles.items}>{items.map((item) => <div key={item.id} className={styles.item}>
          <div className={styles.itemTop}><strong>{item.quantity}× {item.product_name_snapshot}</strong><strong>{money(Number(item.line_total_cents))}</strong></div>
          {item.gas ? <div className={styles.meta}><strong>{item.gas.sale_mode === "exchange" ? "Troca de vasilhame" : "Produto + vasilhame"}</strong> · {item.gas.container_code_snapshot} · {item.gas.container_name_snapshot}{Number(item.gas.unit_container_price_cents) > 0 ? ` · casco ${money(Number(item.gas.unit_container_price_cents))}` : ""}</div> : null}
          {item.modifiers.length > 0 ? <div className={styles.meta}>{item.modifiers.map((modifier) => modifier.modifier_name_snapshot).join(" · ")}</div> : null}
          {item.note ? <div className={styles.meta}>Obs.: {item.note}</div> : null}
        </div>)}</div></div>
      </details>

      <details className={styles.compact}>
        <summary><span>Valores e pagamento</span><strong>{money(Number(order.total_cents))}</strong></summary>
        <div className={styles.compactBody}><div className={styles.summaryRows}>
          <Summary label="Subtotal" value={money(Number(order.subtotal_cents))} />
          {Number(order.discount_cents) > 0 ? <Summary label="Descontos" value={`− ${money(Number(order.discount_cents))}`} /> : null}
          <Summary label="Entrega" value={Number(order.delivery_fee_cents) > 0 ? money(Number(order.delivery_fee_cents)) : fulfillmentType === "delivery" ? "Grátis" : "Não aplicável"} />
          <Summary label="Total" value={money(Number(order.total_cents))} strong />
          <Summary label="Pagamento" value={paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? order.payment_method_snapshot} />
          <Summary label="Quando" value={scheduledLabel ?? "Assim que possível"} />
          {order.cash_change_for_cents ? <Summary label="Troco para" value={money(Number(order.cash_change_for_cents))} /> : null}
        </div></div>
      </details>

      <div className={styles.actions}><Link href={`/m/${slug}`} className={styles.cta}>{terminal ? "Fazer novo pedido" : `Voltar ao ${vocabulary.catalogLabel.toLowerCase()}`}</Link><span className={`${styles.cta} ${styles.ctaSecondary}`}>{terminal ? "Pedido finalizado" : "Acompanhamento ativo"}</span></div>
    </div>
  </main>;
}

function Status({ label, value }: { label: string; value: string }) { return <div className={styles.statusCard}><span className={styles.statusLabel}>{label}</span><strong>{value}</strong></div>; }
function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`${styles.summary} ${strong ? styles.summaryTotal : ""}`}><span>{label}</span><strong>{value}</strong></div>; }
