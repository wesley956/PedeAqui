"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatStoreDateTime } from "@/lib/store-date-time";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { StatusBadge, type OperationalStatusKey } from "@/components/ui/status";
import { OrderActionForm, type ManagerIntent } from "@/features/orders/order-action-form";
import { useOrderAlert } from "@/features/orders/use-order-alert";
import { useRememberedOrderSearch } from "@/features/orders/order-navigation-memory";
import { OperationalRealtimeBadge, useOperationalRealtime } from "@/features/operations/use-operational-realtime";
import {
  canCompleteFromManager,
  completionBlockers,
  deriveOperationalBucket,
  deriveOrderLane,
  elapsedLabel,
  isOrderAttentionLate,
  operationalBucketLabels,
  shouldContinueInDeliveryCenter,
  type OperationalOrderBucket,
  type OrderManagerRow,
} from "@/features/orders/manager-model";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";
import type { PaymentCompletionPolicy } from "@/modules/payment-completion-policy";
import styles from "./order-manager.module.css";

const activeBuckets = ["new", "preparing", "ready", "queued"] as const satisfies readonly OperationalOrderBucket[];
const paymentLabels: Record<string, string> = { pending: "Pgto. pendente", authorized: "Pgto. autorizado", paid: "Pago", failed: "Pgto. falhou", partially_refunded: "Estorno parcial", refunded: "Estornado" };
const fulfillmentLabels: Record<string, string> = {
  pending: "Fulfillment pendente", awaiting_assignment: "Aguardando entregador", assigned: "Entregador definido",
  picked_up: "Retirado pelo entregador", out_for_delivery: "Saiu para entrega", delivered: "Entregue",
  awaiting_pickup: "Aguardando retirada", picked_up_by_customer: "Retirado", served: "Servido",
  canceled: "Fulfillment cancelado", not_required: "Sem fulfillment",
};
const channelLabels: Record<string, string> = { menu: "Cardápio", digital_menu: "Cardápio", pdv: "PDV", dining: "Salão", whatsapp: "WhatsApp", manual: "Manual" };
export type BoardWorkflowMode = "standard" | "simplified";
export type OrderActionSpec = { intent: ManagerIntent; label: string; tone?: "primary" | "secondary" | "danger"; confirmPayment?: boolean };
const isOperationalOrder = (order: OrderManagerRow) => !["completed", "canceled", "rejected"].includes(order.order_status);

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function fulfillmentTypeLabel(type: string) {
  if (type === "delivery") return "Entrega";
  if (type === "pickup") return "Retirada";
  if (type === "dine_in" || type === "table") return "Mesa";
  return type;
}

function statusForOrder(order: OrderManagerRow, bucket: OperationalOrderBucket, labelOverride?: string): { status: OperationalStatusKey; label?: string } {
  if (order.order_status === "completed") return { status: "order_completed" };
  if (order.order_status === "rejected") return { status: "order_cancelled", label: "Recusado" };
  if (order.order_status === "canceled") return { status: "order_cancelled" };
  if (order.fulfillment_status === "out_for_delivery" || labelOverride) return { status: "order_out_for_delivery", label: labelOverride };
  if (bucket === "new") return { status: "order_new" };
  if (bucket === "preparing") return { status: "order_preparing" };
  if (bucket === "ready") return { status: "order_ready" };
  return { status: "order_confirmed" };
}

function isSimplifiedDeliveryFinalized(order: OrderManagerRow) {
  return order.order_status === "confirmed"
    && order.fulfillment_type === "delivery"
    && ["out_for_delivery", "delivered"].includes(order.fulfillment_status);
}

function isManualDeliveryInRoute(order: OrderManagerRow) {
  return order.order_status === "confirmed"
    && order.fulfillment_type === "delivery"
    && order.fulfillment_status === "out_for_delivery";
}

function isManualDeliveryAwaitingFinish(order: OrderManagerRow) {
  return order.order_status === "confirmed"
    && order.fulfillment_type === "delivery"
    && order.fulfillment_status === "delivered";
}

export function primaryActionForOrder(order: OrderManagerRow, workflowMode: BoardWorkflowMode, manualDeliveryMode: boolean, paymentPolicy?: PaymentCompletionPolicy | null): OrderActionSpec | null {
  if (order.order_status === "pending_confirmation") {
    return workflowMode === "simplified"
      ? { intent: "accept_and_start", label: "Aceitar e iniciar" }
      : { intent: "accept", label: "Aceitar pedido" };
  }
  if (order.order_status !== "confirmed") return null;
  if (["pending_confirmation", "queued"].includes(order.production_status)) {
    return { intent: "start_production", label: workflowMode === "simplified" ? "Iniciar" : "Iniciar produção" };
  }
  if (order.production_status === "preparing") {
    return { intent: "mark_ready", label: workflowMode === "simplified" ? "Pronto" : "Marcar pronto" };
  }
  if (order.production_status === "ready" && order.fulfillment_type === "pickup" && order.fulfillment_status === "pending") {
    return { intent: "await_pickup", label: "Liberar retirada" };
  }
  if (order.fulfillment_status === "awaiting_pickup") {
    return { intent: "customer_picked_up", label: "Cliente retirou" };
  }
  if (manualDeliveryMode && ["ready", "not_required"].includes(order.production_status) && order.fulfillment_type === "delivery") {
    if (["pending", "awaiting_assignment", "assigned", "picked_up"].includes(order.fulfillment_status)) {
      return { intent: "manual_out_for_delivery", label: "Saiu para entrega" };
    }
    if (order.fulfillment_status === "out_for_delivery") {
      return { intent: "manual_finish_delivery", label: paymentPolicy === "quick_confirmation" ? "Receber e finalizar" : "Finalizar pedido", confirmPayment: paymentPolicy === "quick_confirmation" };
    }
  }
  if (order.production_status === "ready" && order.fulfillment_type === "delivery" && order.fulfillment_status === "pending") {
    return { intent: "await_courier", label: "Aguardar entregador" };
  }
  if (
    ["ready", "not_required"].includes(order.production_status)
    && order.payment_status === "pending"
    && ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status)
  ) {
    return { intent: "mark_paid", label: "Marcar pago", tone: "secondary" };
  }
  if (canCompleteFromManager(order)) return { intent: "complete", label: "Concluir pedido" };
  return null;
}

export function OrderManagerBoard({ storeId, orders: initialOrders, workflowMode = "standard", manualDeliveryMode = false, paymentPolicy = null, timeZone }: {
  storeId: string;
  orders: OrderManagerRow[];
  workflowMode?: BoardWorkflowMode;
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
    onInsert: (row) => {
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      if (row.order_status === "pending_confirmation") {
        setNotice(`Novo pedido #${row.display_number ?? ""} recebido.`);
        void notifyNewOrder();
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
    return orders.filter((order) =>
      String(order.display_number).includes(needle)
      || order.customer_name_snapshot.toLocaleLowerCase("pt-BR").includes(needle)
      || order.fulfillment_type.toLocaleLowerCase("pt-BR").includes(needle)
      || order.channel.toLocaleLowerCase("pt-BR").includes(needle),
    );
  }, [orders, query]);

  const grouped = useMemo(() => {
    const result: Record<OperationalOrderBucket, OrderManagerRow[]> = {
      new: [], preparing: [], ready: [], queued: [], history: [],
    };
    for (const order of filtered) result[deriveOperationalBucket(order)].push(order);
    return result;
  }, [filtered]);

  const simplifiedFinalized = useMemo(
    () => filtered.filter(isSimplifiedDeliveryFinalized),
    [filtered],
  );
  const simplifiedFinalizedIds = useMemo(
    () => new Set(simplifiedFinalized.map((order) => order.id)),
    [simplifiedFinalized],
  );
  const manualDelivering = useMemo(
    () => manualDeliveryMode ? filtered.filter(isManualDeliveryInRoute) : [],
    [filtered, manualDeliveryMode],
  );
  const manualAwaitingFinish = useMemo(
    () => manualDeliveryMode ? filtered.filter(isManualDeliveryAwaitingFinish) : [],
    [filtered, manualDeliveryMode],
  );
  const manualSpecialIds = useMemo(
    () => new Set([...manualDelivering, ...manualAwaitingFinish].map((order) => order.id)),
    [manualAwaitingFinish, manualDelivering],
  );
  const simplifiedReady = useMemo(
    () => grouped.ready.filter((order) => manualDeliveryMode ? !manualSpecialIds.has(order.id) : !simplifiedFinalizedIds.has(order.id)),
    [grouped.ready, manualDeliveryMode, manualSpecialIds, simplifiedFinalizedIds],
  );

  const activeCount = activeBuckets.reduce((total, bucket) => total + grouped[bucket].length, 0);
  const lateCount = useMemo(() => filtered.filter((order) => isOrderAttentionLate(order, now)).length, [filtered, now]);

  const simplifiedColumns = manualDeliveryMode
    ? [
      { key: "start", label: "Iniciar", orders: [...grouped.new, ...grouped.queued, ...grouped.preparing] },
      { key: "ready", label: "Pronto", orders: simplifiedReady },
      { key: "delivering", label: "Em entrega", orders: manualDelivering },
      { key: "finish", label: "Finalizar", orders: manualAwaitingFinish },
    ]
    : [
      { key: "start", label: "Iniciar", orders: [...grouped.new, ...grouped.queued, ...grouped.preparing] },
      { key: "ready", label: "Pronto", orders: simplifiedReady },
      { key: "completed", label: "Finalizados", orders: simplifiedFinalized },
    ];

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            label="Buscar pedido"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Número, cliente, canal ou modalidade"
          />
        </div>
        <Button type="button" tone="secondary" onClick={() => void toggle()} aria-pressed={soundEnabled}>
          {primaryLabel}
        </Button>
        <Button type="button" tone="secondary" onClick={() => void test()}>
          Testar som
        </Button>
        <div className={styles.toolbarMeta}>
          {workflowMode === "simplified"
            ? `${activeCount} em acompanhamento · ${lateCount} atrasado(s)`
            : `${activeCount} ativo(s) · ${lateCount} atrasado(s) · ${grouped.history.length} no histórico`}
        </div>
        <OperationalRealtimeBadge status={realtimeStatus} />
      </div>

      <div className={styles.noticeSlot} aria-live="polite">
        {notice ? <Alert tone="warning" title={notice} action={<Button type="button" tone="secondary" size="sm" onClick={() => setNotice(null)}>Dispensar</Button>}>A fila foi atualizada em tempo real.</Alert> : null}
      </div>

      {workflowMode === "simplified" ? <div className={styles.activeGrid} aria-label="Pedidos em fluxo simplificado" data-mode="simplified">
        {simplifiedColumns.map((column) => <section key={column.key} aria-label={column.label} className={styles.lane} data-bucket={column.key}>
          <header className={styles.laneHeader}><strong>{column.label}</strong><span className={styles.laneCount}>{column.orders.length}</span></header>
          <div className={styles.laneBody}>
            {column.orders.map((order) => {
              const finalDeliveryLabel = !manualDeliveryMode && column.key === "completed"
                ? order.fulfillment_status === "delivered"
                  ? "Entrega confirmada · aguardando pagamento"
                  : "Aguardando confirmação de entrega"
                : manualDeliveryMode && column.key === "finish"
                  ? "Entrega confirmada · aguardando finalização"
                  : undefined;
              return <OrderCard key={order.id} order={order} now={now} bucket={deriveOperationalBucket(order)} workflowMode="simplified" manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} statusLabelOverride={finalDeliveryLabel} />;
            })}
            {column.orders.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido</div> : null}
          </div>
        </section>)}
      </div> : <><div className={styles.activeGrid} aria-label="Pedidos ativos">
        {activeBuckets.map((bucket) => (
          <section key={bucket} aria-label={operationalBucketLabels[bucket]} className={styles.lane} data-bucket={bucket}>
            <header className={styles.laneHeader}>
              <strong>{operationalBucketLabels[bucket]}</strong>
              <span className={styles.laneCount} aria-label={`${grouped[bucket].length} pedidos`}>{grouped[bucket].length}</span>
            </header>
            <div className={styles.laneBody}>
              {grouped[bucket].map((order) => <OrderCard key={order.id} order={order} now={now} bucket={bucket} workflowMode="standard" manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} />)}
              {grouped[bucket].length === 0 ? <div className={styles.emptyLane}>Nenhum pedido</div> : null}
            </div>
          </section>
        ))}
      </div>

      <details className={styles.history}>
        <summary className={styles.historySummary}>
          <span>Histórico de finalizados, cancelados e recusados</span>
          <span className={styles.historyCount}>{grouped.history.length} pedido(s)</span>
        </summary>
        <div className={styles.historyGrid}>
          {grouped.history.map((order) => <OrderCard key={order.id} order={order} now={now} bucket="history" workflowMode="standard" manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} />)}
          {grouped.history.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido no histórico carregado.</div> : null}
        </div>
      </details></>}
    </div>
  );
}

function OrderCard({ order, now, bucket, workflowMode, manualDeliveryMode, paymentPolicy, timeZone, statusLabelOverride }: {
  order: OrderManagerRow;
  now: number;
  bucket: OperationalOrderBucket;
  workflowMode: BoardWorkflowMode;
  manualDeliveryMode: boolean;
  paymentPolicy: PaymentCompletionPolicy | null;
  timeZone: string;
  statusLabelOverride?: string;
}) {
  const lane = deriveOrderLane(order);
  const blockers = completionBlockers(order);
  const status = statusForOrder(order, bucket, statusLabelOverride);
  const late = isOrderAttentionLate(order, now);
  const primaryAction = primaryActionForOrder(order, workflowMode, manualDeliveryMode, paymentPolicy);
  const continueInDeliveryCenter = shouldContinueInDeliveryCenter(order, manualDeliveryMode);
  const canMarkPaidSecondary = ["ready", "not_required"].includes(order.production_status)
    && order.payment_status === "pending"
    && ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status)
    && primaryAction?.intent !== "mark_paid";
  const scheduledLabel = order.scheduled_for
    ? formatStoreDateTime(order.scheduled_for, timeZone, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <article className={styles.orderCard} data-bucket={bucket} data-late={late || undefined}>
      <div className={styles.cardTop}>
        <div className={styles.orderIdentity}>
          <span className={styles.orderNumber}>#{order.display_number}</span>
          <strong className={styles.customer}>{order.customer_name_snapshot}</strong>
        </div>
        <div className={styles.moneyTime}>
          <span className={styles.total}>{money(order.total_cents)}</span>
          <span className={styles.elapsed}>{elapsedLabel(order.created_at, now)}</span>
        </div>
      </div>

      <div className={styles.compactMeta}>
        <div className={styles.statusRow}>
          <StatusBadge status={status.status} label={status.label} />
          {late ? <StatusBadge status="order_late" /> : null}
        </div>
        <span className={styles.metaText}>{fulfillmentTypeLabel(order.fulfillment_type)} · {paymentLabels[order.payment_status] ?? order.payment_status} · {channelLabels[order.channel] ?? order.channel}</span>
        {scheduledLabel ? <Tag>Agendado {scheduledLabel}</Tag> : null}
      </div>

      {primaryAction ? (
        <div className={styles.primaryAction}>
          <OrderActionForm orderId={order.id} intent={primaryAction.intent} label={primaryAction.label} tone={primaryAction.tone} confirmPayment={primaryAction.confirmPayment} compact />
        </div>
      ) : null}


      {continueInDeliveryCenter ? (
        <div className={styles.primaryAction}>
          <Link href="/entregas" className={styles.deliveryAction}>Atualizar entrega</Link>
        </div>
      ) : null}

      {order.order_status === "confirmed" && lane === "ready" && blockers.length > 0 && !(manualDeliveryMode && order.fulfillment_status === "out_for_delivery") ? <div className={styles.blockers}>Para concluir: {blockers.join("; ")}.</div> : null}

      <details className={styles.cardMore}>
        <summary>Mais</summary>
        <div className={styles.cardMoreBody}>
          <div className={styles.stateLine}>
            {orderStatusLabels[order.order_status]} · {productionStatusLabels[order.production_status]} · {fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status}
          </div>
          <Link href={{ pathname: `/pedidos/${order.id}`, query: { from: "/pedidos" } }} className={styles.detailsLink}>Abrir detalhes</Link>
          {canMarkPaidSecondary ? <OrderActionForm orderId={order.id} intent="mark_paid" label="Marcar pago" tone="secondary" compact /> : null}
          {order.order_status === "pending_confirmation" ? (
            <details className={styles.rejectDetails}>
              <summary className={styles.rejectSummary}>Recusar pedido</summary>
              <div className={styles.rejectBody}><OrderActionForm orderId={order.id} intent="reject" label="Confirmar recusa" tone="danger" reasonLabel="Motivo" reasonPlaceholder="Ex.: item indisponível" compact /></div>
            </details>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}
