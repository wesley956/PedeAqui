"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OrderActionForm } from "@/features/orders/order-action-form";
import { OperationalRealtimeBadge, useOperationalRealtime } from "@/features/operations/use-operational-realtime";
import { resolveKitchenRealtimeOrderAction } from "@/features/kitchen/actions";
import { businessVocabulary, productionStatusLabelForBusiness } from "@/modules/business-vocabulary";
import type { BusinessType } from "@/modules/module-catalog";
import {
  filterKitchenOrdersByStation,
  kitchenElapsedLabel,
  kitchenUrgency,
  type KitchenOrder,
  type KitchenStation,
} from "@/features/kitchen/kitchen-model";
import styles from "./kitchen-board.module.css";

const isOperationalKitchenOrder = () => true;
async function resolveKitchenRow(raw: Record<string, unknown>) {
  return typeof raw.id === "string" ? resolveKitchenRealtimeOrderAction(raw.id) : null;
}

export function KitchenBoard({ storeId, stations, orders: initialOrders, initialNow, businessType = "restaurant" }: {
  storeId: string;
  stations: KitchenStation[];
  orders: KitchenOrder[];
  initialNow: number;
  businessType?: BusinessType;
}) {
  const initialVisibleCount = 120;
  const router = useRouter();
  const [stationId, setStationId] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const vocabulary = businessVocabulary(businessType);
  const { rows: orders, status: realtimeStatus } = useOperationalRealtime({
    storeId,
    initialRows: initialOrders,
    surface: "kitchen",
    isOperational: isOperationalKitchenOrder,
    resolveRow: resolveKitchenRow,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredOrders = useMemo(() => filterKitchenOrdersByStation(orders, stationId), [orders, stationId]);
  const visibleOrders = useMemo(() => filteredOrders.slice(0, visibleCount), [filteredOrders, visibleCount]);
  const stationNames = useMemo(() => new Map(stations.map((station) => [station.id, station.name])), [stations]);
  const counts = useMemo(() => {
    let attention = 0;
    let late = 0;
    for (const order of visibleOrders) {
      const urgency = kitchenUrgency(order, now);
      if (urgency === "attention") attention += 1;
      if (urgency === "late") late += 1;
    }
    return { attention, late };
  }, [now, visibleOrders]);

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <div className={styles.filters} aria-label={vocabulary.productionFilterLabel}>
          <Button tone={stationId === null ? "primary" : "secondary"} size="lg" aria-pressed={stationId === null} onClick={() => setStationId(null)}>Todas</Button>
          {stations.map((station) => <Button key={station.id} tone={stationId === station.id ? "primary" : "secondary"} size="lg" aria-pressed={stationId === station.id} onClick={() => setStationId(station.id)}>{station.name}</Button>)}
        </div>
        <Button type="button" tone="ghost" size="lg" onClick={() => router.refresh()}>Atualizar</Button>
        <OperationalRealtimeBadge status={realtimeStatus} />
      </div>

      <div className={styles.summary} aria-live="polite">
        <Summary label="Na fila" value={filteredOrders.length} />
        <Summary label="Atenção" value={counts.attention} tone="warning" />
        <Summary label="Atrasados" value={counts.late} tone="danger" />
      </div>

      {filteredOrders.length > initialVisibleCount ? <div className={styles.overload} role="alert">
        <strong>Operação acima de 120 pedidos ativos.</strong>
        <span>Todos estão preservados. A tela mostra {visibleOrders.length} de {filteredOrders.length} para manter a leitura fluida.</span>
      </div> : null}

      {stations.length === 0 ? <div className={styles.empty}><strong>{vocabulary.noStationsTitle}</strong><p>{vocabulary.noStationsBody}</p></div> : null}
      {visibleOrders.length === 0 ? <div className={styles.empty}><strong>{vocabulary.noProductionTitle}</strong><p>Pedidos confirmados aparecerão aqui automaticamente quando esta etapa for necessária.</p></div> : (
        <div className={styles.grid}>
          {visibleOrders.map((order) => <KitchenCard key={order.id} order={order} now={now} stationNames={stationNames} filteredByStation={stationId !== null} businessType={businessType} />)}
        </div>
      )}
      {visibleOrders.length < filteredOrders.length ? <Button type="button" tone="secondary" size="lg" onClick={() => setVisibleCount((count) => Math.min(count + initialVisibleCount, filteredOrders.length))}>Carregar mais {Math.min(initialVisibleCount, filteredOrders.length - visibleOrders.length)} pedido(s)</Button> : null}
    </div>
  );
}

function KitchenCard({ order, now, stationNames, filteredByStation, businessType }: {
  order: KitchenOrder;
  now: number;
  stationNames: Map<string, string>;
  filteredByStation: boolean;
  businessType: BusinessType;
}) {
  const urgency = kitchenUrgency(order, now);
  const canStart = ["pending_confirmation", "queued"].includes(order.productionStatus);
  const canReady = order.productionStatus === "preparing";
  const vocabulary = businessVocabulary(businessType);

  return (
    <article className={styles.card} data-urgency={urgency}>
      <header className={styles.cardHeader}>
        <div><div className={styles.orderNumber}>#{order.displayNumber}</div><strong className={styles.customer}>{order.customerName}</strong><div className={styles.fulfillment}>{order.fulfillmentType === "delivery" ? "Entrega" : order.fulfillmentType === "pickup" ? "Retirada" : order.fulfillmentType}</div></div>
        <div className={styles.timerBlock}><div className={styles.timer}>{kitchenElapsedLabel(order, now)}</div><div className={styles.production}>{productionStatusLabelForBusiness(order.productionStatus, businessType)}</div>{urgency !== "fresh" ? <div className={styles.urgency}>{urgency === "late" ? "Atrasado" : "Atenção"}</div> : null}</div>
      </header>

      <div className={styles.items}>
        {order.items.map((item) => <div key={item.id} className={styles.item}>
          <div className={styles.itemMain}><strong className={styles.quantity}>{item.quantity}×</strong><strong className={styles.itemName}>{item.name}</strong></div>
          {item.modifiers.length > 0 ? <div className={styles.modifiers}>{item.modifiers.map((modifier, index) => <div key={`${item.id}:${modifier.groupName}:${modifier.name}:${index}`}>+ {modifier.name}</div>)}</div> : null}
          {item.note ? <div className={styles.note}>Observação: {item.note}</div> : null}
          {!filteredByStation ? <div className={styles.stations}>{item.stationIds.length > 0 ? item.stationIds.map((id) => <span className={styles.stationTag} key={id}>{stationNames.get(id) ?? "Estação"}</span>) : <span className={styles.stationTag} data-warning="true">Sem estação</span>}</div> : null}
        </div>)}
      </div>

      <footer className={styles.actions}>
        <div className={styles.primaryAction}>
          {canStart ? <OrderActionForm orderId={order.id} intent="start_production" label={vocabulary.startProductionLabel} /> : null}
          {canReady ? <OrderActionForm orderId={order.id} intent="mark_ready" label={vocabulary.markReadyLabel} /> : null}
          {!canStart && !canReady ? <div className={styles.production}>{vocabulary.noProductionActionLabel}</div> : null}
        </div>
        <Link href={`/pedidos/${order.id}`} className={styles.detailLink}>Detalhes</Link>
      </footer>
    </article>
  );
}

function Summary({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "danger" }) {
  return <div className={styles.summaryItem} data-tone={tone}><span>{label}</span><strong className={styles.summaryValue}>{value}</strong></div>;
}
