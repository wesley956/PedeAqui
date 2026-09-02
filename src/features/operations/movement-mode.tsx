"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { OrderActionForm } from "@/features/orders/order-action-form";
import { primaryActionForOrder, type BoardWorkflowMode } from "@/features/orders/order-manager-board";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import type { PaymentCompletionPolicy } from "@/modules/payment-completion-policy";
import { elapsedLabel, elapsedMinutes } from "@/features/orders/manager-model";
import { OperationalRealtimeBadge, useOperationalRealtime } from "@/features/operations/use-operational-realtime";
import type { OperationalHealthIssue } from "@/server/operations/operational-health-service";
import styles from "@/app/(app)/movimento/movimento.module.css";

type Profile = "all" | "service" | "kitchen" | "dispatch";
const active = (order: OrderManagerRow) => !["completed", "canceled", "rejected"].includes(order.order_status);

function profileFor(order: OrderManagerRow): Exclude<Profile, "all"> {
  if (order.order_status === "pending_confirmation") return "service";
  if (["pending_confirmation", "queued", "preparing"].includes(order.production_status)) return "kitchen";
  return "dispatch";
}
function severityFor(order: OrderManagerRow, now: number): keyof typeof rank {
  const minutes = elapsedMinutes(order.created_at, now);
  if (order.order_status === "pending_confirmation" && minutes >= 10) return "P0";
  if (minutes >= 30 || order.payment_status === "failed") return "P1";
  return minutes >= 15 ? "P2" : "P3";
}
const rank = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;

export function MovementMode({ storeId, initialOrders, workflowMode, manualDeliveryMode, paymentPolicy, healthIssues }: { storeId: string; initialOrders: OrderManagerRow[]; workflowMode: BoardWorkflowMode; manualDeliveryMode: boolean; paymentPolicy: PaymentCompletionPolicy | null; healthIssues: OperationalHealthIssue[] }) {
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<Profile>("all");
  const [now, setNow] = useState(() => Date.now());
  const { rows: orders, status } = useOperationalRealtime({ storeId, initialRows: initialOrders, surface: "movement", isOperational: active });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  const tasks = useMemo(() => orders.map((order) => ({ order, action: primaryActionForOrder(order, workflowMode, manualDeliveryMode, paymentPolicy), profile: profileFor(order), severity: severityFor(order, now) }))
    .filter((task) => task.action)
    .filter((task) => profile === "all" || task.profile === profile)
    .filter((task) => { const needle = query.trim().toLocaleLowerCase("pt-BR"); return !needle || String(task.order.display_number).includes(needle) || task.order.customer_name_snapshot.toLocaleLowerCase("pt-BR").includes(needle); })
    .sort((a, b) => rank[a.severity] - rank[b.severity] || Date.parse(a.order.created_at) - Date.parse(b.order.created_at)), [orders, workflowMode, manualDeliveryMode, paymentPolicy, profile, query, now]);
  return <div className={styles.mode}>
    <div className={styles.controls}>
      <Input label="Buscar pedido ou cliente" placeholder="Número ou nome" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className={styles.profiles} aria-label="Filtrar por equipe">{([['all','Tudo'],['service','Atendimento'],['kitchen','Cozinha'],['dispatch','Expedição']] as const).map(([value,label]) => <button type="button" key={value} data-active={profile === value} onClick={() => setProfile(value)}>{label}</button>)}</div>
      <OperationalRealtimeBadge status={status} />
    </div>
    {healthIssues.length ? <section className={styles.exceptions} aria-label="Falhas operacionais">{healthIssues.map((issue) => <article key={issue.id} data-severity={issue.severity}><span>{issue.severity}</span><div><strong>{issue.title}</strong><p>{issue.impact}</p></div><Link href={issue.area === "printing" ? "/configuracoes/impressoes" : "/configuracoes/pagamentos"}>Resolver</Link></article>)}</section> : null}
    <section className={styles.queue} aria-label="Próximas ações">
      {tasks.map(({ order, action, severity, profile: taskProfile }) => action ? <article key={order.id} data-severity={severity}>
        <div className={styles.priority}><strong>{severity}</strong><span>{elapsedLabel(order.created_at, now)}</span></div>
        <div className={styles.identity}><span>Pedido #{order.display_number} · {taskProfile === "service" ? "Atendimento" : taskProfile === "kitchen" ? "Cozinha" : "Expedição"}</span><strong>{order.customer_name_snapshot || "Cliente"}</strong><small>{order.fulfillment_type === "delivery" ? "Entrega" : order.fulfillment_type === "pickup" ? "Retirada" : "Salão"}</small></div>
        <div className={styles.primary}><OrderActionForm orderId={order.id} intent={action.intent} label={action.label} tone={action.tone} confirmPayment={action.confirmPayment} /><Link href={`/pedidos/${order.id}`}>Ver detalhes</Link></div>
      </article> : null)}
      {!tasks.length ? <div className={styles.empty}><strong>Nenhuma ação nessa fila ✓</strong><span>{query ? "Tente outra busca ou equipe." : "A equipe está em dia neste momento."}</span></div> : null}
    </section>
  </div>;
}
