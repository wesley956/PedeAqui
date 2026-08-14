import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DeliverySla } from "@/features/delivery/delivery-sla";
import { DeliveryOperationForm } from "@/features/delivery/operation-forms";
import styles from "@/features/delivery/courier.module.css";

function address(order: NonNullable<Awaited<ReturnType<typeof DeliveryOperationsService.loadDriverView>>["deliveries"][number]["order"]>) {
  const line = [order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ");
  return [line, order.address_complement_snapshot, order.address_district_snapshot, [order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}
const statusLabel: Record<string, string> = { assigned: "Aguardando retirada no restaurante", picked_up: "Pedido retirado", out_for_delivery: "Em rota para o cliente" };

export default async function DriverPage() {
  const data = await DeliveryOperationsService.loadDriverView();
  if (!data.context.storeId) throw new Error("Uma unidade ativa é necessária");
  const active = data.deliveries.filter((item) => item.order && item.order.fulfillment_status !== "delivered");

  return <section className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div><p className="muted" style={{ margin: 0 }}>MINHA ROTA</p><h1>Entregas</h1><div className={styles.driverState}>{data.driver.name} · {data.driver.active ? (data.driver.on_duty ? "em serviço" : "fora de serviço") : "inativo"}</div></div>
        <DeliveryRealtime storeId={data.context.storeId} showStatus />
      </div>
      <a href="/entregador" className={styles.refresh}>Atualizar lista</a>
    </header>

    {!data.driver.active || !data.driver.on_duty ? <article className={styles.offDuty}><strong>Você está fora de serviço.</strong><p>Entregas já atribuídas continuam visíveis, mas novas atribuições ficam bloqueadas pela operação até seu status ser alterado.</p></article> : null}

    {active.length === 0 ? <article className={styles.empty}><strong>Nenhuma entrega ativa.</strong><p>Quando uma entrega for atribuída ao seu usuário nesta unidade, ela aparecerá aqui automaticamente.</p></article> : <div className={styles.list}>{active.map((item) => {
      const order = item.order!;
      const destination = address(order) || "Endereço não informado";
      const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
      const nextAction = order.fulfillment_status === "assigned" ? <DeliveryOperationForm intent="picked_up" deliveryId={item.id} prominent />
        : order.fulfillment_status === "picked_up" ? <DeliveryOperationForm intent="out_for_delivery" deliveryId={item.id} prominent />
          : order.fulfillment_status === "out_for_delivery" ? <DeliveryOperationForm intent="delivered" deliveryId={item.id} prominent /> : null;

      return <article key={item.id} className={styles.card}>
        <div className={styles.cardHeader}>
          <div><div className={styles.orderNumber}>Pedido #{order.display_number}</div><div className={styles.customer}>{order.customer_name_snapshot}</div><div className={styles.status}>{statusLabel[order.fulfillment_status] ?? order.fulfillment_status}</div></div>
          <div className={styles.deadline}><DeliverySla promisedByAt={item.promised_by_at} deliveredAt={item.delivered_at} /></div>
        </div>

        <div className={styles.destination}>
          <span className={styles.label}>Destino</span>
          <div className={styles.address}>{destination}</div>
          {order.address_reference_snapshot ? <div className={styles.reference}><strong>Referência:</strong> {order.address_reference_snapshot}</div> : null}
        </div>

        <div className={styles.contactRow}>
          <a href={mapsHref} target="_blank" rel="noreferrer" className={styles.routeLink}>Abrir rota</a>
          {order.customer_phone_snapshot ? <a href={`tel:${order.customer_phone_snapshot}`} className={styles.phoneLink}>Ligar para cliente</a> : <span className={styles.phoneLink} aria-disabled="true">Telefone não informado</span>}
        </div>

        {nextAction ? <div className={styles.next}><span className={styles.nextLabel}>Próxima ação</span>{nextAction}</div> : null}
      </article>;
    })}</div>}
  </section>;
}
