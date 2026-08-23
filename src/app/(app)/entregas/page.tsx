import Link from "next/link";
import { DeliveryBoard } from "@/features/delivery/delivery-board";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DeliverySla } from "@/features/delivery/delivery-sla";
import styles from "@/features/delivery/delivery.module.css";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { RouteTrackingService } from "@/server/delivery/route-tracking-service";
import { RouteTrackingPanel } from "@/features/delivery/route-tracking-panel";

function address(order: Awaited<ReturnType<typeof DeliveryOperationsService.loadOperations>>["deliveries"][number]) {
  const line = [order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ");
  return [line, order.address_complement_snapshot, order.address_district_snapshot, [order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}

export default async function DeliveryOperationsPage() {
  const [data, tracking] = await Promise.all([DeliveryOperationsService.loadOperations(), RouteTrackingService.loadOwnerPanel()]);
  if (!data.context.storeId) throw new Error("Uma unidade ativa é necessária");

  const open = data.deliveries.filter((item) => item.fulfillment_status !== "delivered");
  const delivered = data.deliveries.filter((item) => item.fulfillment_status === "delivered").slice(-20).reverse();
  const driversForForm = data.drivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    active: driver.active,
    on_duty: driver.on_duty,
    max_active_deliveries: Number(driver.max_active_deliveries),
    activeDeliveries: driver.activeDeliveries,
  }));
  const driverNames = Object.fromEntries(data.drivers.map((driver) => [driver.id, driver.name]));
  const boardDeliveries = open.map((order) => ({ ...order, delivery_fee_cents: Number(order.delivery_fee_cents) }));

  return <section className={styles.page}>
    <DeliveryRealtime storeId={data.context.storeId} />
    <header className={styles.header}>
      <div>
        <p className="muted">EXPEDIÇÃO E ÚLTIMA MILHA</p>
        <h1>Entregas</h1>
        <p className="muted">Priorize o que está aguardando, acompanhe o prazo gravado no pedido e avance cada entrega com o mínimo de cliques.</p>
      </div>
      <div className={styles.headerActions}>
        <Link href="/configuracoes/entrega" className={styles.secondaryLink}>Áreas e taxas</Link>
        {data.canManageDrivers ? <Link href="/configuracoes/entregadores" className={styles.secondaryLink}>Entregadores</Link> : null}
      </div>
    </header>

    <div className={styles.metrics} aria-label="Resumo das entregas">
      <Metric label="Abertas" value={open.length} />
      <Metric label="Aguardando" value={open.filter((item) => ["pending", "awaiting_assignment"].includes(item.fulfillment_status)).length} />
      <Metric label="Em rota" value={open.filter((item) => item.fulfillment_status === "out_for_delivery").length} />
      <Metric label="Entregadores em serviço" value={data.drivers.filter((driver) => driver.active && driver.on_duty).length} />
    </div>

    <DeliveryBoard deliveries={boardDeliveries} drivers={driversForForm} driverNames={driverNames} />

    <RouteTrackingPanel data={tracking} />

    <details className={styles.completed}>
      <summary>Entregues recentes ({delivered.length})</summary>
      <div className={styles.completedBody}>
        {delivered.length === 0 ? <p className="muted">Nenhuma entrega concluída entre as últimas carregadas.</p> : delivered.map((order) => <div className={styles.completedRow} key={order.id}>
          <div><strong>#{order.display_number} · {order.customer_name_snapshot}</strong><div className={styles.completedMeta}>{address(order) || "Endereço não informado"}</div></div>
          <DeliverySla promisedByAt={order.delivery?.promised_by_at ?? null} deliveredAt={order.delivery?.delivered_at ?? null} />
        </div>)}
      </div>
    </details>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}
