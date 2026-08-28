"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { OrderActionForm } from "@/features/orders/order-action-form";
import { elapsedLabel, type OrderManagerRow } from "@/features/orders/manager-model";
import { useOrderAlert } from "@/features/orders/use-order-alert";
import {
  deliveryWorkflowStages,
  foldStageToVisible,
  pickupWorkflowStages,
  workflowStageLabels,
  type CustomWorkflowConfig,
  type WorkflowStage,
} from "@/features/orders/workflow-config";
import styles from "./order-manager.module.css";

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

function nextAction(order: OrderManagerRow) {
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
  if (order.fulfillment_type === "delivery" && order.production_status === "ready" && !["delivered"].includes(order.fulfillment_status)) {
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

function Card({ order, now }: { order: OrderManagerRow; now: number }) {
  return <article className={styles.orderCard}>
    <div className={styles.cardTop}>
      <div className={styles.orderIdentity}><span className={styles.orderNumber}>#{order.display_number}</span><strong className={styles.customer}>{order.customer_name_snapshot}</strong></div>
      <div className={styles.moneyTime}><span className={styles.total}>{money(order.total_cents)}</span><span className={styles.elapsed}>{elapsedLabel(order.created_at, now)}</span></div>
    </div>
    <div className={styles.tags}>
      <span>{order.fulfillment_type === "delivery" ? "Entrega" : order.fulfillment_type === "pickup" ? "Retirada" : "Atendimento"}</span>
      <span>{order.payment_status === "paid" ? "Pago" : "Pagamento pendente"}</span>
    </div>
    <div className={styles.stateLine}>Etapa visual: {workflowStageLabels[rawStage(order)]}</div>
    <div className={styles.actions}>{nextAction(order)}<Link href={`/pedidos/${order.id}`} className={styles.detailsLink}>Ver pedido</Link></div>
  </article>;
}

function FlowSection({ title, stages, orders, config, now }: { title: string; stages: readonly WorkflowStage[]; orders: OrderManagerRow[]; config: CustomWorkflowConfig; now: number }) {
  return <section style={{ display: "grid", gap: 10 }}>
    <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}><h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2><span className="muted" style={{ fontSize: 12 }}>{orders.length} pedido(s)</span></header>
    <div className={styles.activeGrid} data-mode="custom">
      {stages.map((stage) => {
        const stageOrders = orders.filter((order) => visibleStage(order, config) === stage);
        return <section key={stage} className={styles.lane} data-bucket={stage} aria-label={`${title}: ${workflowStageLabels[stage]}`}>
          <header className={styles.laneHeader}><strong>{workflowStageLabels[stage]}</strong><span className={styles.laneCount}>{stageOrders.length}</span></header>
          <div className={styles.laneBody}>{stageOrders.map((order) => <Card key={order.id} order={order} now={now} />)}{stageOrders.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido</div> : null}</div>
        </section>;
      })}
    </div>
  </section>;
}

export function CustomOrderWorkflowBoard({ storeId, orders, config }: { storeId: string; orders: OrderManagerRow[]; config: CustomWorkflowConfig }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set(orders.map((order) => order.id)));
  const { soundEnabled, primaryLabel, toggle, test, notifyNewOrder } = useOrderAlert(setNotice);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`custom-order-manager:${storeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const row = payload.new as { id?: string; display_number?: number; order_status?: string };
          if (row.id && !seen.current.has(row.id)) {
            seen.current.add(row.id);
            if (row.order_status === "pending_confirmation") {
              setNotice(`Novo pedido #${row.display_number ?? ""} recebido.`);
              void notifyNewOrder();
            }
          }
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [notifyNewOrder, router, storeId]);

  useEffect(() => {
    for (const order of orders) seen.current.add(order.id);
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return orders;
    return orders.filter((order) => String(order.display_number).includes(needle) || order.customer_name_snapshot.toLocaleLowerCase("pt-BR").includes(needle));
  }, [orders, query]);

  const deliveryOrders = filtered.filter((order) => order.fulfillment_type === "delivery");
  const pickupOrders = filtered.filter((order) => order.fulfillment_type !== "delivery");

  return <div className={styles.board}>
    <div className={styles.toolbar}>
      <div className={styles.search}><Input label="Buscar pedido" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número ou cliente" /></div>
      <Button type="button" tone="secondary" onClick={() => void toggle()} aria-pressed={soundEnabled}>{primaryLabel}</Button>
      <Button type="button" tone="secondary" onClick={() => void test()}>Testar som</Button>
      <div className={styles.toolbarMeta}>Fluxo personalizado · {filtered.length} pedido(s)</div>
    </div>
    <div className={styles.noticeSlot} aria-live="polite">
      {notice ? <Alert tone="warning" title={notice} action={<Button type="button" tone="secondary" size="sm" onClick={() => setNotice(null)}>Dispensar</Button>}>A fila foi atualizada em tempo real.</Alert> : null}
    </div>
    <FlowSection title="Entrega" stages={config.delivery} orders={deliveryOrders} config={config} now={now} />
    <FlowSection title="Retirada e atendimento" stages={config.pickup} orders={pickupOrders} config={config} now={now} />
  </div>;
}