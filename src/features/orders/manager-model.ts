import type { FulfillmentStatus, OrderStatus, PaymentStatus, ProductionStatus } from "@/server/orders/state-machines";

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

export const orderLaneLabels: Record<OrderLane, string> = {
  new: "Novos",
  confirmed: "Confirmados",
  preparing: "Em produção",
  ready: "Prontos",
  finished: "Finalizados",
};

export function deriveOrderLane(order: Pick<OrderManagerRow, "order_status" | "production_status" | "fulfillment_status">): OrderLane {
  if (["completed", "canceled", "rejected"].includes(order.order_status)) return "finished";
  if (order.order_status === "pending_confirmation") return "new";
  if (order.production_status === "preparing") return "preparing";
  if (order.production_status === "ready") return "ready";
  if (["delivered", "picked_up_by_customer", "served"].includes(order.fulfillment_status)) return "ready";
  return "confirmed";
}

export function elapsedLabel(createdAt: string, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return "—";
  const totalMinutes = Math.max(0, Math.floor((now - created) / 60_000));
  if (totalMinutes < 1) return "agora";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function canCompleteFromManager(order: Pick<OrderManagerRow, "order_status" | "payment_status" | "fulfillment_status">) {
  const fulfillmentDone = ["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status);
  return order.order_status === "confirmed" && order.payment_status === "paid" && fulfillmentDone;
}

export function completionBlockers(order: Pick<OrderManagerRow, "order_status" | "payment_status" | "fulfillment_status">) {
  const blockers: string[] = [];
  if (order.order_status !== "confirmed") blockers.push("pedido não está confirmado");
  if (order.payment_status !== "paid") blockers.push("pagamento não está pago");
  if (!["delivered", "picked_up_by_customer", "served", "not_required"].includes(order.fulfillment_status)) blockers.push("entrega/retirada não foi concluída");
  return blockers;
}
