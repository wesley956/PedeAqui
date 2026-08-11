"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OrderActionForm } from "@/features/orders/order-action-form";
import {
  canCompleteFromManager,
  completionBlockers,
  deriveOrderLane,
  elapsedLabel,
  orderLaneLabels,
  type OrderLane,
  type OrderManagerRow,
} from "@/features/orders/manager-model";
import { orderStatusLabels, productionStatusLabels } from "@/server/orders/state-machines";

const lanes: OrderLane[] = ["new", "confirmed", "preparing", "ready", "finished"];
const paymentLabels: Record<string, string> = { pending: "Pgto. pendente", authorized: "Pgto. autorizado", paid: "Pago", failed: "Pgto. falhou", partially_refunded: "Estorno parcial", refunded: "Estornado" };
const fulfillmentLabels: Record<string, string> = {
  pending: "Fulfillment pendente", awaiting_assignment: "Aguardando entregador", assigned: "Entregador definido",
  picked_up: "Retirado pelo entregador", out_for_delivery: "Saiu para entrega", delivered: "Entregue",
  awaiting_pickup: "Aguardando retirada", picked_up_by_customer: "Retirado", served: "Servido",
  canceled: "Fulfillment cancelado", not_required: "Sem fulfillment",
};

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

async function playAlertTone() {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  await context.resume();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
  gain.connect(context.destination);
  for (const [index, frequency] of [660, 880].entries()) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.18);
    oscillator.stop(context.currentTime + index * 0.18 + 0.22);
  }
  window.setTimeout(() => void context.close(), 900);
}

export function OrderManagerBoard({ storeId, orders }: { storeId: string; orders: OrderManagerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set(orders.map((order) => order.id)));
  const soundEnabledRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const enabled = window.localStorage.getItem(`pedeaqui:orders:sound:${storeId}`) === "on";
      setSoundEnabled(enabled);
      soundEnabledRef.current = enabled;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storeId]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

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
              if (soundEnabledRef.current) void playAlertTone();
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
      || order.fulfillment_type.toLocaleLowerCase("pt-BR").includes(needle),
    );
  }, [orders, query]);

  const grouped = useMemo(() => {
    return Object.fromEntries(lanes.map((lane) => [lane, filtered.filter((order) => deriveOrderLane(order) === lane)])) as Record<OrderLane, OrderManagerRow[]>;
  }, [filtered]);

  async function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    window.localStorage.setItem(`pedeaqui:orders:sound:${storeId}`, next ? "on" : "off");
    if (next) await playAlertTone();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 260px" }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Buscar pedido</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Número, cliente ou modalidade"
            style={inputStyle}
          />
        </label>
        <button type="button" onClick={() => void toggleSound()} style={soundEnabled ? soundOnButton : secondaryButton} aria-pressed={soundEnabled}>
          {soundEnabled ? "Som ativo" : "Ativar som"}
        </button>
        <div className="muted" style={{ fontSize: 12, paddingBottom: 9 }}>{orders.length} pedido(s) carregado(s)</div>
      </div>

      <div aria-live="polite" role="status" style={{ minHeight: notice ? 42 : 0 }}>
        {notice ? (
          <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #7a4b1b", background: "#2d251d", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <strong>{notice}</strong>
            <button type="button" onClick={() => setNotice(null)} style={secondaryButton}>Dispensar</button>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(285px, 1fr)", gap: 12, overflowX: "auto", alignItems: "start", paddingBottom: 8 }}>
        {lanes.map((lane) => (
          <section key={lane} aria-label={orderLaneLabels[lane]} style={{ minWidth: 285, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <header style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "12px 13px", borderBottom: "1px solid var(--border)" }}>
              <strong>{orderLaneLabels[lane]}</strong>
              <span style={{ minWidth: 24, height: 24, borderRadius: 999, background: lane === "new" && grouped[lane].length ? "var(--accent)" : "var(--surface-3)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900 }}>{grouped[lane].length}</span>
            </header>
            <div style={{ display: "grid", gap: 9, padding: 9, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
              {grouped[lane].map((order) => <OrderCard key={order.id} order={order} now={now} />)}
              {grouped[lane].length === 0 ? <div className="muted" style={{ padding: 18, textAlign: "center", fontSize: 12 }}>Nenhum pedido</div> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order, now }: { order: OrderManagerRow; now: number }) {
  const lane = deriveOrderLane(order);
  const blockers = completionBlockers(order);
  return (
    <article className="card" style={{ padding: 12, display: "grid", gap: 10, border: lane === "new" ? "1px solid var(--accent)" : "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 18 }}>#{order.display_number}</div>
          <strong style={{ display: "block", marginTop: 2 }}>{order.customer_name_snapshot}</strong>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong style={{ color: "var(--accent)" }}>{money(order.total_cents)}</strong>
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{elapsedLabel(order.created_at, now)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <Tag>{order.fulfillment_type === "delivery" ? "Entrega" : order.fulfillment_type === "pickup" ? "Retirada" : order.fulfillment_type}</Tag>
        <Tag>{paymentLabels[order.payment_status] ?? order.payment_status}</Tag>
        <Tag>{productionStatusLabels[order.production_status]}</Tag>
      </div>

      <div className="muted" style={{ fontSize: 11 }}>
        {orderStatusLabels[order.order_status]} · {fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {order.order_status === "pending_confirmation" ? (
          <>
            <OrderActionForm orderId={order.id} intent="accept" label="Aceitar pedido" compact />
            <details>
              <summary style={{ fontSize: 12, cursor: "pointer", color: "#f97066" }}>Recusar pedido</summary>
              <div style={{ marginTop: 7 }}><OrderActionForm orderId={order.id} intent="reject" label="Confirmar recusa" tone="danger" reasonLabel="Motivo" reasonPlaceholder="Ex.: item indisponível" compact /></div>
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

      {order.order_status === "confirmed" && lane === "ready" && blockers.length > 0 ? <div className="muted" style={{ fontSize: 10 }}>Para concluir: {blockers.join("; ")}.</div> : null}

      <Link href={`/pedidos/${order.id}`} style={{ display: "block", textAlign: "center", padding: "7px 9px", borderRadius: 9, border: "1px solid var(--border)", fontSize: 12, fontWeight: 800 }}>Abrir detalhes</Link>
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ padding: "4px 7px", borderRadius: 999, background: "var(--surface-3)", fontSize: 10, fontWeight: 800 }}>{children}</span>;
}

const inputStyle: React.CSSProperties = { minHeight: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" };
const secondaryButton: React.CSSProperties = { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-3)", color: "var(--text)", padding: "8px 11px", fontWeight: 800, cursor: "pointer" };
const soundOnButton: React.CSSProperties = { ...secondaryButton, borderColor: "var(--accent)", color: "var(--accent)" };
