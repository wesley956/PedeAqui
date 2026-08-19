"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";
import { Button } from "@/components/ui/button";
import { OrderActionForm } from "@/features/orders/order-action-form";
import {
  filterKitchenOrdersByStation,
  kitchenElapsedLabel,
  kitchenUrgency,
  type KitchenOrder,
  type KitchenStation,
} from "@/features/kitchen/kitchen-model";
import styles from "./kitchen-board.module.css";

const productionLabels: Record<KitchenOrder["productionStatus"], string> = {
  pending_confirmation: "Aguardando início",
  queued: "Na fila",
  preparing: "Em preparo",
  ready: "Pronto",
};

export function KitchenBoard({ storeId, stations, orders, initialNow }: {
  storeId: string;
  stations: KitchenStation[];
  orders: KitchenOrder[];
  initialNow: number;
}) {
  const router = useRouter();
  const [stationId, setStationId] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`kds:${scope.storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: scope.filter }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, storeId]);

  const visibleOrders = useMemo(() => filterKitchenOrdersByStation(orders, stationId), [orders, stationId]);
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
        <div className={styles.filters} aria-label="Filtrar produção por estação">
          <Button tone={stationId === null ? "primary" : "secondary"} size="lg" aria-pressed={stationId === null} onClick={() => setStationId(null)}>Todas</Button>
          {stations.map((station) => (
            <Button key={station.id} tone={stationId === station.id ? "primary" : "secondary"} size="lg" aria-pressed={stationId === station.id} onClick={() => setStationId(station.id)}>
              {station.name}
            </Button>
          ))}
        </div>
        <Button type="button" tone="ghost" size="lg" onClick={() => router.refresh()}>Atualizar</Button>
      </div>

      <div className={styles.summary} aria-live="polite">
        <Summary label="Na tela" value={visibleOrders.length} />
        <Summary label="Atenção" value={counts.attention} tone="warning" />
        <Summary label="Atrasados" value={counts.late} tone="danger" />
      </div>

      {stations.length === 0 ? (
        <div className={styles.empty}>
          <strong>Nenhuma estação de produção ativa</strong>
          <p>O painel em “Todas” continua exibindo pedidos. Configure estações em Configurações → Impressões para usar o filtro por cozinha, chapa ou fritura.</p>
        </div>
      ) : null}

      {visibleOrders.length === 0 ? (
        <div className={styles.empty}>
          <strong>Nenhum pedido em produção</strong>
          <p>Pedidos confirmados aparecerão aqui automaticamente.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {visibleOrders.map((order) => (
            <KitchenCard key={order.id} order={order} now={now} stationNames={stationNames} filteredByStation={stationId !== null} />
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenCard({ order, now, stationNames, filteredByStation }: {
  order: KitchenOrder;
  now: number;
  stationNames: Map<string, string>;
  filteredByStation: boolean;
}) {
  const urgency = kitchenUrgency(order, now);
  const canStart = ["pending_confirmation", "queued"].includes(order.productionStatus);
  const canReady = order.productionStatus === "preparing";

  return (
    <article className={styles.card} data-urgency={urgency}>
      <header className={styles.cardHeader}>
        <div>
          <div className={styles.orderNumber}>#{order.displayNumber}</div>
          <strong className={styles.customer}>{order.customerName}</strong>
          <div className={styles.fulfillment}>{order.fulfillmentType === "delivery" ? "Entrega" : order.fulfillmentType === "pickup" ? "Retirada" : order.fulfillmentType}</div>
        </div>
        <div className={styles.timerBlock}>
          <div className={styles.timer}>{kitchenElapsedLabel(order, now)}</div>
          <div className={styles.production}>{productionLabels[order.productionStatus]}</div>
          {urgency !== "fresh" ? <div className={styles.urgency}>{urgency === "late" ? "Atrasado" : "Atenção"}</div> : null}
        </div>
      </header>

      <div className={styles.items}>
        {order.items.map((item) => (
          <div key={item.id} className={styles.item}>
            <div className={styles.itemMain}>
              <strong className={styles.quantity}>{item.quantity}×</strong>
              <strong className={styles.itemName}>{item.name}</strong>
            </div>
            {item.modifiers.length > 0 ? (
              <div className={styles.modifiers}>
                {item.modifiers.map((modifier, index) => <div key={`${item.id}:${modifier.groupName}:${modifier.name}:${index}`}>+ {modifier.name}</div>)}
              </div>
            ) : null}
            {item.note ? <div className={styles.note}>Observação: {item.note}</div> : null}
            {!filteredByStation ? (
              <div className={styles.stations}>
                {item.stationIds.length > 0
                  ? item.stationIds.map((stationId) => <span className={styles.stationTag} key={stationId}>{stationNames.get(stationId) ?? "Estação"}</span>)
                  : <span className={styles.stationTag} data-warning="true">Sem estação</span>}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <footer className={styles.actions}>
        <div className={styles.primaryAction}>
          {canStart ? <OrderActionForm orderId={order.id} intent="start_production" label="Iniciar preparo" /> : null}
          {canReady ? <OrderActionForm orderId={order.id} intent="mark_ready" label="Marcar como pronto" /> : null}
          {!canStart && !canReady ? <div className={styles.production}>Sem ação de produção pendente</div> : null}
        </div>
        <Link href={`/pedidos/${order.id}`} className={styles.detailLink}>Detalhes</Link>
      </footer>
    </article>
  );
}

function Summary({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "danger" }) {
  return <div className={styles.summaryItem} data-tone={tone}><span>{label}</span><strong className={styles.summaryValue}>{value}</strong></div>;
}
