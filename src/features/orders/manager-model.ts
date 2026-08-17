import type { FulfillmentStatus, OrderStatus, PaymentStatus, ProductionStatus } from "@/server/orders/state-machines";
import { paymentAllowsOrderCompletion } from "@/server/orders/state-machines";

export type OrderManagerRow = {
  id: string;
  display_number: number;
  channel: string;
  fulfillment_type: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  production_status: ProductionStatus;
  fulfillment_status: FulfillmentStatus;
  customer_name_snapshot: string;
  total_cents: number | string;
  created_at: string;
  updated_at: string;
};

export type OrderLane = "new" | "confirmed" | "preparing" | "ready" | "finished";
export type OperationalOrderBucket = "new" | "preparing" | "ready" | "queued" | "history";

export const ORDER_ATTENTION_MINUTES = 30;

export const orderLaneLabels: Record<OrderLane, string> = {
  new: "Novos",
  confirmed: "Confirmados",
  preparing: "Em produção",
  ready: "Prontos",
  finished: "Finalizados",
};

export const operationalBucketLabels: Record<OperationalOrderBucket, string> = {
  new: "Novos",
  preparing: "Em preparo",
  ready: "Prontos",
  queued: "A iniciar",
  history: "Histórico",
};

export function deriveOrderLane(order: Pick<OrderManagerRow, "order_status" | "production_status" | "fulfillment_status">): OrderLane {
  if (["completed", "canceled", "rejected"].includes(order.order_status)) return "finished";
  if (order.order_status === "pending_confirmation") return "new";
  if (order.production_status === "preparing") return "preparing";
  if (order.production_status === "ready") return "ready";
  if (["delivered", "picked_up_by_customer", "served"].includes(order.fulfillment_status)) return "ready";
  return "confirmed";
}

export function elapsedMinutes(createdAt: string, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 60_000));
}

export function elapsedLabel(createdAt: string, now = Date.now()) {
  const totalMinutes = elapsedMinutes(createdAt, now);
  if (totalMinutes < 1) return "agora";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function isOrderAttentionLate(order: Pick<OrderManagerRow, "order_status" | "created_at">, now = Date.now(), thresholdMinutes = ORDER_ATTENTION_MINUTES) {
  if (["completed", "canceled", "rejected"].includes(order.order_status)) return false;
  return elapsedMinutes(order.created_at, now) >= thresholdMinutes;
}

export function deriveOperationalBucket(order: Pick<OrderManagerRow, "order_status" | "production_status" | "fulfillment_status">): OperationalOrderBucket {
  const lane = deriveOrderLane(order);
  if (lane === "finished") return "history";
  if (lane === "new") return "new";
  if (lane === "preparing") return "preparing";
  if (lane === "ready") return "ready";
  return "queued";
}

export function canCompleteFromManager(order: Pick<OrderManagerRow, "order_status" | "payment_status" | "fulfillment_status">) {
  const fulfillmentDone = ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status);
  return order.order_status === "confirmed" && paymentAllowsOrderCompletion(order.payment_status) && fulfillmentDone;
}

export function completionBlockers(order: Pick<OrderManagerRow, "order_status" | "payment_status" | "fulfillment_status">) {
  const blockers: string[] = [];
  if (order.order_status !== "confirmed") blockers.push("pedido não está confirmado");
  if (!paymentAllowsOrderCompletion(order.payment_status)) blockers.push("pagamento ainda não está liquidado");
  if (!["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status)) blockers.push("entrega/retirada não foi concluída");
  return blockers;
}
