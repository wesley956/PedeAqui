"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatStoreDateTime } from "@/lib/store-date-time";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { OrderActionForm } from "@/features/orders/order-action-form";
import {
  externalLogisticsLabel,
  externalPaymentLabel,
  externalSyncLabel,
  orderChannelBadgeLabel,
} from "@/features/orders/external-order-presentation";
import { resolveOrderManagerRealtimeAction } from "@/features/orders/order-realtime-actions";
import { elapsedLabel, type OrderManagerRow } from "@/features/orders/manager-model";
import { useOrderAlert } from "@/features/orders/use-order-alert";
import { useRememberedOrderSearch } from "@/features/orders/order-navigation-memory";
import { OperationalRealtimeBadge, useOperationalRealtime } from "@/features/operations/use-operational-realtime";
import type { PaymentCompletionPolicy } from "@/modules/payment-completion-policy";
import {
  deliveryWorkflowStages,
  foldStageToVisible,
  pickupWorkflowStages,
  workflowStageLabels,
  type CustomWorkflowConfig,
  type WorkflowStage,
} from "@/features/orders/workflow-config";
import styles from "./order-manager.module.css";

const isOperationalOrder = (order: OrderManagerRow) => !["completed", "canceled", "rejected"].includes(order.order_status);

async function resolveOrderRow(raw: Record<string, unknown>) {
  return typeof raw.id === "string" ? resolveOrderManagerRealtimeAction(raw.id) : null;
}

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function rawStage(order: OrderManagerRow): WorkflowStage {
  if (["completed", "canceled", "rejected"].includes(order.order_status)) return "finished";
  if (order.order_status === "pending_confirmation") return "new";
  if (["pending_confirmation", "queued", "preparing"].includes(order.production_status)) return "preparing";
  if (order.fulfillment_type === "delivery") {
    if (["assigned", "picked_up", "out_for_delivery", "delivered"].includes(order.fulfillment_status)) return "delivering";
    return "ready";
  }
  if (["awaiting_pickup"].includes(order.fulfillment_status)) return "awaiting_pickup";
  if (["picked_up_by_customer", "served"].includes(order.fulfillment_status)) return "finished";
  return "ready";
}

function visibleStage(order: OrderManagerRow, config: CustomWorkflowConfig) {
  const raw = rawStage(order);
  if (order.fulfillment_type === "delivery") {
    return foldStageToVisible(raw as (typeof deliveryWorkflowStages)[number], config.delivery, deliveryWorkflowStages);
  }
  const pickupRaw = raw === "delivering" ? "ready" : raw;
  return foldStageToVisible(pickupRaw as (typeof pickupWorkflowStages)[number], config.pickup, pickupWorkflowStages);
}

function nextAction(order: OrderManagerRow, manualDeliveryMode: boolean, paymentPolicy: PaymentCompletionPolicy | null) {
  if (order.order_status === "pending_confirmation") return <OrderActionForm orderId={order.id} intent="accept" label="Aceitar" compact />;
  if (order.order_status !== "confirmed") return null;
  if (["pending_confirmation", "queued"].includes(order.production_status)) return <OrderActionForm orderId={order.id} intent="start_production" label="Iniciar preparo" compact />;
  if (order.production_status === "preparing") return <OrderActionForm orderId={order.id} intent="mark_ready" label="Marcar pronto" compact />;
  if (order.production_status === "ready" && order.fulfillment_type === "pickup" && !["awaiting_pickup", "picked_up_by_customer"].includes(order.fulfillment_status)) {
    return <OrderActionForm orderId={order.id} intent="await_pickup" label="Aguardar retirada" compact />;
  }
  if (order.fulfillment_type === "pickup" && order.fulfillment_status === "awaiting_pickup") {
    return <OrderActionForm orderId={order.id} intent="customer_picked_up" label="Cliente retirou" compact />;
  }
  if (order.fulfillment_type === "delivery" && ["ready", "not_required"].includes(order.production_status) && !["delivered"].includes(order.fulfillment_status)) {
    if (manualDeliveryMode) {
      if (order.fulfillment_status === "out_for_delivery") {
        return <OrderActionForm orderId={order.id} intent="manual_finish_delivery" label={paymentPolicy === "quick_confirmation" ? "Receber e finalizar" : "Finalizar pedido"} confirmPayment={paymentPolicy === "quick_confirmation"} compact />;
      }
      return <OrderActionForm orderId={order.id} intent="manual_out_for_delivery" label="Saiu para entrega" compact />;
    }
    return <Link href="/entregas" className={styles.detailsLink}>Continuar na Central de Entregas →</Link>;
  }
  if (order.payment_status === "pending" && ["delivered", "picked_up_by_customer", "served"].includes(order.fulfillment_status)) {
    return <OrderActionForm orderId={order.id} intent="mark_paid" label="Marcar pago" compact />;
  }
  if (order.payment_status === "paid" && ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status)) {
    return <OrderActionForm orderId={order.id} intent="complete" label="Finalizar pedido" compact />;
  }
  return null;
}

function Card({ order, now, manualDeliveryMode, paymentPolicy, timeZone }: { order: OrderManagerRow; now: number; manualDeliveryMode: boolean; paymentPolicy: PaymentCompletionPolicy | null; timeZone: string }) {
  const action = nextAction(order, manualDeliveryMode, paymentPolicy);
  const modality = order.fulfillment_type === "delivery" ? "Entrega" : order.fulfillment_type === "pickup" ? "Retirada" : "Atendimento";
  const external = order.external;
  const channelBadge = orderChannelBadgeLabel(order.channel, external);
  const logisticsLabel = external ? externalLogisticsLabel(external) : null;
  const scheduledLabel = order.scheduled_for
    ? formatStoreDateTime(order.scheduled_for, timeZone, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const recommendedPreparationLabel = external?.recommendedPreparationAt
    ? formatStoreDateTime(external.recommendedPreparationAt, timeZone, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return <article className={styles.orderCard} data-channel={external?.provider ?? "pedeaqui"}>
    <div className={styles.cardTop}>
      <div className={styles.orderIdentity}><span className={styles.orderNumber}>#{order.display_number}</span><strong className={styles.customer}>{order.customer_name_snapshot}</strong></div>
      <div className={styles.moneyTime}><span className={styles.total}>{money(order.total_cents)}</span><span className={styles.elapsed}>{elapsedLabel(order.created_at, now)}</span></div>
    </div>
    <div className={styles.compactMeta}>
      <div className={styles.statusRow}>
        <Tag>{channelBadge}</Tag>
        {external ? <Tag>{externalSyncLabel(external.syncStatus)}</Tag> : null}
      </div>
      <span className={styles.metaText}>{modality} · {order.payment_status === "paid" ? "Pago" : "Pagamento pendente"} · {workflowStageLabels[rawStage(order)]}</span>
      {external?.externalDisplayId ? <Tag>Cód. {external.externalDisplayId}</Tag> : null}
      {external ? <Tag>{externalPaymentLabel(external)}</Tag> : null}
      {logisticsLabel ? <Tag>{logisticsLabel}</Tag> : null}
      {scheduledLabel ? <Tag>Agendado {scheduledLabel}</Tag> : null}
      {recommendedPreparationLabel ? <Tag>Preparar a partir de {recommendedPreparationLabel}</Tag> : null}
    </div>
    {action ? <div className={styles.primaryAction}>{action}</div> : null}
    <details className={styles.cardMore}>
      <summary>Mais</summary>
      <div className={styles.cardMoreBody}>
        <div className={styles.stateLine}>Etapa operacional: {workflowStageLabels[rawStage(order)]}</div>
        {external ? <div className={styles.stateLine}>Origem: {channelBadge}{external.externalDisplayId ? ` · código ${external.externalDisplayId}` : ""} · {externalSyncLabel(external.syncStatus)}</div> : null}
        <Link href={{ pathname: `/pedidos/${order.id}`, query: { from: "/pedidos" } }} className={styles.detailsLink}>Ver pedido</Link>
      </div>
    </details>
  </article>;
}

function FlowSection({ title, stages, orders, config, now, manualDeliveryMode, paymentPolicy, timeZone }: {
  title: string;
  stages: readonly WorkflowStage[];
  orders: OrderManagerRow[];
  config: CustomWorkflowConfig;
  now: number;
  manualDeliveryMode: boolean;
  paymentPolicy: PaymentCompletionPolicy | null;
  timeZone: string;
}) {
  return <section style={{ display: "grid", gap: 10 }}>
    <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}><h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2><span className="muted" style={{ fontSize: 12 }}>{orders.length} pedido(s)</span></header>
    <div className={styles.activeGrid} data-mode="custom">
      {stages.map((stage) => {
        const stageOrders = orders.filter((order) => visibleStage(order, config) === stage);
        return <section key={stage} className={styles.lane} data-bucket={stage} aria-label={`${title}: ${workflowStageLabels[stage]}`}>
          <header className={styles.laneHeader}><strong>{workflowStageLabels[stage]}</strong><span className={styles.laneCount}>{stageOrders.length}</span></header>
          <div className={styles.laneBody}>{stageOrders.map((order) => <Card key={order.id} order={order} now={now} manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} />)}{stageOrders.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido</div> : null}</div>
        </section>;
      })}
    </div>
  </section>;
}

export function CustomOrderWorkflowBoard({ storeId, orders: initialOrders, config, manualDeliveryMode = false, paymentPolicy = null, timeZone }: {
  storeId: string;
  orders: OrderManagerRow[];
  config: CustomWorkflowConfig;
  manualDeliveryMode?: boolean;
  paymentPolicy?: PaymentCompletionPolicy | null;
  timeZone: string;
}) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set(initialOrders.map((order) => order.id)));
  const { soundEnabled, primaryLabel, toggle, test, notifyNewOrder } = useOrderAlert(setNotice);
  useRememberedOrderSearch("orders:active:query", query, setQuery);
  const { rows: orders, status: realtimeStatus } = useOperationalRealtime({
    storeId,
    initialRows: initialOrders,
    surface: "orders",
    isOperational: isOperationalOrder,
    resolveRow: resolveOrderRow,
    onInsert: (row) => {
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      if (row.order_status === "pending_confirmation") {
        setNotice(`Novo pedido #${row.display_number ?? ""} recebido.`);
        void notifyNewOrder(row.display_number, row.id);
      }
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    for (const order of orders) seen.current.add(order.id);
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return orders;
    return orders.filter((order) => {
      const external = order.external;
      return String(order.display_number).includes(needle)
        || order.customer_name_snapshot.toLocaleLowerCase("pt-BR").includes(needle)
        || orderChannelBadgeLabel(order.channel, external).toLocaleLowerCase("pt-BR").includes(needle)
        || Boolean(external?.externalDisplayId?.toLocaleLowerCase("pt-BR").includes(needle))
        || Boolean(external?.externalOrderId.toLocaleLowerCase("pt-BR").includes(needle))
        || Boolean(external && externalSyncLabel(external.syncStatus).toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [orders, query]);

  const deliveryOrders = filtered.filter((order) => order.fulfillment_type === "delivery");
  const pickupOrders = filtered.filter((order) => order.fulfillment_type !== "delivery");

  return <div className={styles.board}>
    <div className={styles.toolbar}>
      <div className={styles.search}><Input label="Buscar pedido" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número, cliente, canal ou código externo" /></div>
      <Button type="button" tone="secondary" onClick={() => void toggle()} aria-pressed={soundEnabled}>{primaryLabel}</Button>
      <Button type="button" tone="secondary" onClick={() => void test()}>Testar som</Button>
      <div className={styles.toolbarMeta}>Fluxo personalizado · {filtered.length} pedido(s)</div>
      <OperationalRealtimeBadge status={realtimeStatus} />
    </div>
    <div className={styles.noticeSlot} aria-live="polite">
      {notice ? <Alert tone="warning" title={notice} action={<Button type="button" tone="secondary" size="sm" onClick={() => setNotice(null)}>Dispensar</Button>}>A fila foi atualizada em tempo real.</Alert> : null}
    </div>
    <FlowSection title="Entrega" stages={config.delivery} orders={deliveryOrders} config={config} now={now} manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} />
    <FlowSection title="Retirada e atendimento" stages={config.pickup} orders={pickupOrders} config={config} now={now} manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} />
  </div>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}
