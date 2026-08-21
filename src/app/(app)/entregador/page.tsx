import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DeliverySla } from "@/features/delivery/delivery-sla";
import { DeliveryOperationForm } from "@/features/delivery/operation-forms";
import styles from "@/features/delivery/courier.module.css";

function address(order: NonNullable<Awaited<ReturnType<typeof DeliveryOperationsService.loadDriverView>>["deliveries"][number]["order"]>) {
  const line = [order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ");
  return [line, order.address_complement_snapshot, order.address_district_snapshot, [order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0) / 100);
}

function paymentMethodLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    cash: "Dinheiro",
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    card: "Cartão",
  };
  return labels[value ?? ""] ?? (value ? value : "Não informado");
}

function whatsappHref(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function deliveredAt(value: string | null | undefined) {
  if (!value) return "Concluída";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const statusLabel: Record<string, string> = {
  assigned: "Aguardando retirada na loja",
  picked_up: "Pedido retirado",
  out_for_delivery: "Em rota para o cliente",
};

export default async function DriverPage() {
  const data = await DeliveryOperationsService.loadDriverView();
  if (!data.context.storeId) throw new Error("Uma unidade ativa é necessária");
  const active = data.deliveries.filter((item) => item.order && item.order.fulfillment_status !== "delivered");
  const history = data.deliveries.filter((item) => item.order?.fulfillment_status === "delivered").slice(0, 10);

  return <section className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div><p className="muted" style={{ margin: 0 }}>MEU ROTEIRO</p><h1>Minhas entregas</h1><div className={styles.driverState}>{data.driver.name} · {data.driver.active ? (data.driver.on_duty ? "em serviço" : "fora de serviço") : "inativo"}</div></div>
        <DeliveryRealtime storeId={data.context.storeId} showStatus />
      </div>
      <a href="/entregador" className={styles.refresh}>Atualizar lista</a>
    </header>

    {!data.driver.active || !data.driver.on_duty ? <article className={styles.offDuty}><strong>Você está fora de serviço.</strong><p>Entregas já atribuídas continuam visíveis, mas novas atribuições ficam bloqueadas pela operação até seu status ser alterado.</p></article> : null}

    {active.length === 0 ? <article className={styles.empty}><strong>Nenhuma entrega ativa.</strong><p>Quando uma entrega for atribuída a você, ela aparecerá aqui automaticamente.</p></article> : <div className={styles.list}>{active.map((item) => {
      const order = item.order!;
      const destination = address(order) || "Endereço não informado";
      const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
      const whatsapp = whatsappHref(order.customer_phone_snapshot);
      const paid = order.payment_status === "paid";
      const paymentMethod = paymentMethodLabel(order.payment_method_snapshot);
      const paymentText = paid
        ? `Pagamento confirmado · ${paymentMethod}`
        : order.payment_method_snapshot === "cash"
          ? `Receber ${money(order.total_cents)} em dinheiro${order.cash_change_for_cents ? ` · Troco para ${money(order.cash_change_for_cents)}` : ""}`
          : `Pagamento pendente · ${paymentMethod} · ${money(order.total_cents)}`;
      const nextAction = order.fulfillment_status === "assigned" ? <DeliveryOperationForm intent="picked_up" deliveryId={item.id} prominent />
        : order.fulfillment_status === "picked_up" ? <DeliveryOperationForm intent="out_for_delivery" deliveryId={item.id} prominent />
          : order.fulfillment_status === "out_for_delivery" ? <DeliveryOperationForm intent="delivered" deliveryId={item.id} prominent /> : null;

      return <article key={item.id} className={styles.card}>
        <div className={styles.cardHeader}>
          <div><div className={styles.orderNumber}>Pedido #{order.display_number}</div><div className={styles.customer}>{order.customer_name_snapshot}</div><div className={styles.status}>{statusLabel[order.fulfillment_status] ?? order.fulfillment_status}</div></div>
          <div className={styles.deadline}><DeliverySla promisedByAt={item.promised_by_at} deliveredAt={item.delivered_at} /></div>
        </div>

        <section className={styles.orderContents}>
          <span className={styles.label}>O que levar</span>
          <div className={styles.items}>{order.items.map((orderItem) => <div key={orderItem.id} className={styles.itemRow}>
            <div><strong>{orderItem.quantity}× {orderItem.product_name_snapshot}</strong>{orderItem.gas ? <span className={styles.itemMeta}>{orderItem.gas.sale_mode === "exchange" ? "Troca de vasilhame" : "Produto + casco"}{orderItem.gas.container_name_snapshot ? ` · ${orderItem.gas.container_name_snapshot}` : ""}</span> : null}{orderItem.note ? <span className={styles.itemNote}>Obs.: {orderItem.note}</span> : null}</div>
            <strong>{money(Number(orderItem.line_total_cents))}</strong>
          </div>)}</div>
        </section>

        <section className={`${styles.payment} ${paid ? styles.paymentPaid : styles.paymentPending}`}>
          <span className={styles.label}>Pagamento</span>
          <strong>{paymentText}</strong>
        </section>

        <div className={styles.destination}>
          <span className={styles.label}>Destino</span>
          <div className={styles.address}>{destination}</div>
          {order.address_reference_snapshot ? <div className={styles.reference}><strong>Referência:</strong> {order.address_reference_snapshot}</div> : null}
        </div>

        <div className={styles.contactRow}>
          <a href={mapsHref} target="_blank" rel="noreferrer" className={styles.routeLink}>Abrir rota</a>
          {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className={styles.whatsappLink}>WhatsApp do cliente</a> : null}
          {order.customer_phone_snapshot ? <a href={`tel:${order.customer_phone_snapshot}`} className={styles.phoneLink}>Ligar para cliente</a> : <span className={styles.phoneLink} aria-disabled="true">Telefone não informado</span>}
        </div>

        {nextAction ? <div className={styles.next}><span className={styles.nextLabel}>Próxima ação</span>{nextAction}</div> : null}
      </article>;
    })}</div>}

    {history.length > 0 ? <details className={styles.history}>
      <summary>Histórico recente · {history.length}</summary>
      <div className={styles.historyList}>{history.map((item) => item.order ? <div key={item.id} className={styles.historyRow}>
        <div><strong>Pedido #{item.order.display_number}</strong><span>{item.order.customer_name_snapshot}</span></div>
        <span>{deliveredAt(item.delivered_at)}</span>
      </div> : null)}</div>
    </details> : null}
  </section>;
}
