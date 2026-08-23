"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { StatusBadge, type OperationalStatusKey } from "@/components/ui/status";
import { OrderActionForm } from "@/features/orders/order-action-form";
import { playOrderAlertTone } from "@/features/orders/order-alert-tone";
import {
  canCompleteFromManager,
  completionBlockers,
  deriveOperationalBucket,
  deriveOrderLane,
  elapsedLabel,
  isOrderAttentionLate,
  operationalBucketLabels,
  type OperationalOrderBucket,
  type OrderManagerRow,
} from "@/features/orders/manager-model";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";
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

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function fulfillmentTypeLabel(type: string) {
  if (type === "delivery") return "Entrega";
  if (type === "pickup") return "Retirada";
  if (type === "dine_in" || type === "table") return "Mesa";
  return type;
}

function statusForOrder(order: OrderManagerRow, bucket: OperationalOrderBucket): { status: OperationalStatusKey; label?: string } {
  if (order.order_status === "completed") return { status: "order_completed" };
  if (order.order_status === "rejected") return { status: "order_cancelled", label: "Recusado" };
  if (order.order_status === "canceled") return { status: "order_cancelled" };
  if (order.fulfillment_status === "out_for_delivery") return { status: "order_out_for_delivery" };
  if (bucket === "new") return { status: "order_new" };
  if (bucket === "preparing") return { status: "order_preparing" };
  if (bucket === "ready") return { status: "order_ready" };
  return { status: "order_confirmed" };
}

export function OrderManagerBoard({ storeId, orders, workflowMode = "standard" }: { storeId: string; orders: OrderManagerRow[]; workflowMode?: "standard" | "simplified" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set(orders.map((order) => order.id)));
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      soundEnabledRef.current = false;
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-manager:${storeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const row = payload.new as { id?: string; display_number?: number; order_status?: string };
          if (row.id && !seen.current.has(row.id)) {
            seen.current.add(row.id);
            if (row.order_status === "pending_confirmation") {
              setNotice(`Novo pedido #${row.display_number ?? ""} recebido.`);
              if (soundEnabledRef.current && audioContextRef.current) {
                void playOrderAlertTone(audioContextRef.current).catch(() => {
                  soundEnabledRef.current = false;
                  setSoundEnabled(false);
                  setNotice("Novo pedido recebido. O navegador bloqueou o som; toque em Ativar som novamente.");
                });
              }
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
  }, [router, storeId]);

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

  const activeCount = activeBuckets.reduce((total, bucket) => total + grouped[bucket].length, 0);
  const lateCount = useMemo(() => filtered.filter((order) => isOrderAttentionLate(order, now)).length, [filtered, now]);

  async function toggleSound() {
    if (soundEnabled) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") await context.close();
      return;
    }
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setNotice("Este navegador não oferece aviso sonoro. O alerta visual continuará ativo.");
      return;
    }
    try {
      const context = new AudioContextCtor();
      await context.resume();
      audioContextRef.current = context;
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      await playOrderAlertTone(context);
    } catch {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      setNotice("Não foi possível ativar o som neste navegador. O alerta visual continuará ativo.");
    }
  }

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
        <Button type="button" tone="secondary" onClick={() => void toggleSound()} aria-pressed={soundEnabled}>
          {soundEnabled ? "Som ativo ✓" : "Ativar som"}
        </Button>
        <div className={styles.toolbarMeta}>{activeCount} ativo(s) · {lateCount} atrasado(s) · {grouped.history.length} no histórico</div>
      </div>

      <div className={styles.noticeSlot} aria-live="polite">
        {notice ? <Alert tone="warning" title={notice} action={<Button type="button" tone="secondary" size="sm" onClick={() => setNotice(null)}>Dispensar</Button>}>A fila foi atualizada em tempo real.</Alert> : null}
      </div>

      {workflowMode === "simplified" ? <div className={styles.activeGrid} aria-label="Pedidos em fluxo simplificado" data-mode="simplified">
        {([
          { key: "start", label: "Iniciar", orders: [...grouped.new, ...grouped.queued, ...grouped.preparing] },
          { key: "ready", label: "Pronto", orders: grouped.ready },
          { key: "completed", label: "Finalizados", orders: grouped.history },
        ] as const).map((column) => <section key={column.key} aria-label={column.label} className={styles.lane} data-bucket={column.key}>
          <header className={styles.laneHeader}><strong>{column.label}</strong><span className={styles.laneCount}>{column.orders.length}</span></header>
          <div className={styles.laneBody}>{column.orders.map((order) => <OrderCard key={order.id} order={order} now={now} bucket={deriveOperationalBucket(order)} />)}{column.orders.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido</div> : null}</div>
        </section>)}
      </div> : <><div className={styles.activeGrid} aria-label="Pedidos ativos">
        {activeBuckets.map((bucket) => (
          <section key={bucket} aria-label={operationalBucketLabels[bucket]} className={styles.lane} data-bucket={bucket}>
            <header className={styles.laneHeader}>
              <strong>{operationalBucketLabels[bucket]}</strong>
              <span className={styles.laneCount} aria-label={`${grouped[bucket].length} pedidos`}>{grouped[bucket].length}</span>
            </header>
            <div className={styles.laneBody}>
              {grouped[bucket].map((order) => <OrderCard key={order.id} order={order} now={now} bucket={bucket} />)}
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
          {grouped.history.map((order) => <OrderCard key={order.id} order={order} now={now} bucket="history" />)}
          {grouped.history.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido no histórico carregado.</div> : null}
        </div>
      </details></>}
    </div>
  );
}

function OrderCard({ order, now, bucket }: { order: OrderManagerRow; now: number; bucket: OperationalOrderBucket }) {
  const lane = deriveOrderLane(order);
  const blockers = completionBlockers(order);
  const status = statusForOrder(order, bucket);
  const late = isOrderAttentionLate(order, now);
  const scheduledLabel = order.scheduled_for
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduled_for))
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

      <div className={styles.statusRow}>
        <StatusBadge status={status.status} label={status.label} />
        {late ? <StatusBadge status="order_late" /> : null}
      </div>

      <div className={styles.tags} aria-label="Origem e modalidade do pedido">
        <Tag>{channelLabels[order.channel] ?? order.channel}</Tag>
        <Tag>{fulfillmentTypeLabel(order.fulfillment_type)}</Tag>
        <Tag>{paymentLabels[order.payment_status] ?? order.payment_status}</Tag>
        {scheduledLabel ? <Tag>Agendado {scheduledLabel}</Tag> : null}
      </div>

      <div className={styles.stateLine}>
        {orderStatusLabels[order.order_status]} · {productionStatusLabels[order.production_status]} · {fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status}
      </div>

      <div className={styles.actions}>
        {order.order_status === "pending_confirmation" ? (
          <>
            <OrderActionForm orderId={order.id} intent="accept" label="Aceitar pedido" compact />
            <details>
              <summary className={styles.rejectSummary}>Recusar pedido</summary>
              <div className={styles.rejectBody}><OrderActionForm orderId={order.id} intent="reject" label="Confirmar recusa" tone="danger" reasonLabel="Motivo" reasonPlaceholder="Ex.: item indisponível" compact /></div>
            </details>
          </>
        ) : null}
        {order.order_status === "confirmed" && ["pending_confirmation", "queued"].includes(order.production_status) ? <OrderActionForm orderId={order.id} intent="start_production" label="Iniciar produção" compact /> : null}
        {order.production_status === "preparing" ? <OrderActionForm orderId={order.id} intent="mark_ready" label="Marcar pronto" compact /> : null}
        {order.production_status === "ready" && order.payment_status === "pending" ? <OrderActionForm orderId={order.id} intent="mark_paid" label="Marcar pago" tone="secondary" compact /> : null}
        {order.production_status === "ready" && order.fulfillment_type === "pickup" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="await_pickup" label="Liberar retirada" compact /> : null}
        {order.fulfillment_status === "awaiting_pickup" ? <OrderActionForm orderId={order.id} intent="customer_picked_up" label="Cliente retirou" compact /> : null}
        {order.production_status === "ready" && order.fulfillment_type === "delivery" && order.fulfillment_status === "pending" ? <OrderActionForm orderId={order.id} intent="await_courier" label="Aguardar entregador" compact /> : null}
        {canCompleteFromManager(order) ? <OrderActionForm orderId={order.id} intent="complete" label="Concluir pedido" compact /> : null}
      </div>

      {order.order_status === "confirmed" && lane === "ready" && blockers.length > 0 ? <div className={styles.blockers}>Para concluir: {blockers.join("; ")}.</div> : null}

      <Link href={`/pedidos/${order.id}`} className={styles.detailsLink}>Abrir detalhes</Link>
    </article>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}
