"use client";

import { useEffect, useMemo, useState } from "react";
import { DeliveryOperationForm } from "@/features/delivery/operation-forms";
import { DeliverySla } from "@/features/delivery/delivery-sla";
import styles from "@/features/delivery/delivery.module.css";

type DriverOption = { id: string; name: string; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number };
type DeliveryRow = {
  id: string;
  display_number: number;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  address_street_snapshot: string | null;
  address_number_snapshot: string | null;
  address_complement_snapshot: string | null;
  address_district_snapshot: string | null;
  address_city_snapshot: string | null;
  address_state_snapshot: string | null;
  address_reference_snapshot: string | null;
  delivery_fee_cents: number;
  delivery_estimated_min_minutes: number | null;
  delivery_estimated_max_minutes: number | null;
  payment_status: string;
  production_status: string;
  fulfillment_status: string;
  delivery: { id: string; driver_id: string | null; promised_by_at: string | null; delivered_at: string | null } | null;
};

type QueueKey = "late" | "waiting" | "assigned" | "picked_up" | "route";
const queueLabels: Record<QueueKey, string> = {
  late: "Atrasadas",
  waiting: "Aguardando expedição",
  assigned: "Com entregador",
  picked_up: "Retiradas",
  route: "Em rota",
};
const queueOrder: QueueKey[] = ["late", "waiting", "assigned", "picked_up", "route"];

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
function fullAddress(order: DeliveryRow) {
  const line = [order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ");
  return [line, order.address_complement_snapshot, order.address_district_snapshot, [order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}
function isLate(order: DeliveryRow, now: number) {
  const promised = order.delivery?.promised_by_at;
  return Boolean(promised && !order.delivery?.delivered_at && Date.parse(promised) < now);
}
function queueFor(order: DeliveryRow, now: number): QueueKey {
  if (isLate(order, now)) return "late";
  if (["pending", "awaiting_assignment"].includes(order.fulfillment_status)) return "waiting";
  if (order.fulfillment_status === "assigned") return "assigned";
  if (order.fulfillment_status === "picked_up") return "picked_up";
  return "route";
}

export function DeliveryBoard({ deliveries, drivers, driverNames }: {
  deliveries: DeliveryRow[];
  drivers: DriverOption[];
  driverNames: Record<string, string>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const queues = useMemo(() => {
    const grouped = new Map<QueueKey, DeliveryRow[]>(queueOrder.map((key) => [key, []]));
    for (const delivery of deliveries) grouped.get(queueFor(delivery, now))?.push(delivery);
    return grouped;
  }, [deliveries, now]);

  return <div className={styles.board}>
    {queueOrder.map((key) => {
      const items = queues.get(key) ?? [];
      if (key !== "waiting" && items.length === 0) return null;
      return <section className={styles.queue} data-queue={key} key={key} aria-labelledby={`delivery-queue-${key}`}>
        <div className={styles.queueHeader}><h2 id={`delivery-queue-${key}`}>{queueLabels[key]}</h2><span className={styles.queueCount}>{items.length}</span></div>
        {items.length === 0 ? <div className={styles.empty}>Nenhuma entrega aguardando neste momento.</div> : <div className={styles.cards}>{items.map((order) => <DeliveryCard key={order.id} order={order} drivers={drivers} driverNames={driverNames} now={now} />)}</div>}
      </section>;
    })}
  </div>;
}

function DeliveryCard({ order, drivers, driverNames, now }: { order: DeliveryRow; drivers: DriverOption[]; driverNames: Record<string, string>; now: number }) {
  const delivery = order.delivery;
  const late = isLate(order, now);
  const canStart = order.fulfillment_status === "pending" && ["ready", "not_required"].includes(order.production_status);
  const canAssign = ["awaiting_assignment", "assigned"].includes(order.fulfillment_status) || canStart;
  const status = order.fulfillment_status === "pending" ? "Pronta para expedição"
    : order.fulfillment_status === "awaiting_assignment" ? "Aguardando entregador"
      : order.fulfillment_status === "assigned" ? "Entregador atribuído"
        : order.fulfillment_status === "picked_up" ? "Retirada no restaurante" : "Em rota";

  return <article className={styles.card} data-late={late || undefined}>
    <div className={styles.cardHeader}>
      <div><div className={styles.orderTitle}>#{order.display_number} · {order.customer_name_snapshot}</div><div className={styles.status}>{status} · Produção: {order.production_status}</div></div>
      <div className={styles.deadline}><DeliverySla promisedByAt={delivery?.promised_by_at ?? null} deliveredAt={delivery?.delivered_at ?? null} /></div>
    </div>
    <div className={styles.infoGrid}>
      <Info label="Endereço" value={fullAddress(order) || "Endereço não informado"} wide />
      <Info label="Entregador" value={delivery?.driver_id ? driverNames[delivery.driver_id] ?? "Entregador" : "Não atribuído"} />
      <Info label="Frete" value={money(order.delivery_fee_cents)} accent />
      <Info label="Telefone" value={order.customer_phone_snapshot || "Não informado"} />
      <Info label="Estimativa do pedido" value={order.delivery_estimated_min_minutes && order.delivery_estimated_max_minutes ? `${order.delivery_estimated_min_minutes}–${order.delivery_estimated_max_minutes} min` : "Não informada"} />
    </div>
    {order.address_reference_snapshot ? <div className={styles.reference}><strong>Referência:</strong> {order.address_reference_snapshot}</div> : null}
    <div className={styles.actions}>
      {canStart && !delivery ? <DeliveryOperationForm intent="waiting" orderId={order.id} /> : null}
      {canAssign ? <DeliveryOperationForm intent="assign" orderId={order.id} drivers={drivers} currentDriverId={delivery?.driver_id ?? null} /> : null}
      {order.fulfillment_status === "assigned" && delivery ? <DeliveryOperationForm intent="picked_up" deliveryId={delivery.id} /> : null}
      {order.fulfillment_status === "picked_up" && delivery ? <DeliveryOperationForm intent="out_for_delivery" deliveryId={delivery.id} /> : null}
      {order.fulfillment_status === "out_for_delivery" && delivery ? <DeliveryOperationForm intent="delivered" deliveryId={delivery.id} paymentPending={order.payment_status !== "paid"} /> : null}
    </div>
  </article>;
}

function Info({ label, value, wide = false, accent = false }: { label: string; value: string; wide?: boolean; accent?: boolean }) {
  return <div className={`${styles.info} ${wide ? styles.infoWide : ""}`}><span className={styles.infoLabel}>{label}</span><div className={`${styles.infoValue} ${accent ? styles.fee : ""}`}>{value}</div></div>;
}
