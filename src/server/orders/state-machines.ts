export type OrderStatus = "pending_confirmation" | "confirmed" | "rejected" | "canceled" | "completed";
export type PaymentStatus = "pending" | "authorized" | "paid" | "failed" | "partially_refunded" | "refunded";
export type ProductionStatus = "pending_confirmation" | "queued" | "preparing" | "ready" | "canceled" | "not_required";
export type FulfillmentStatus = "pending" | "awaiting_assignment" | "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "awaiting_pickup" | "picked_up_by_customer" | "served" | "canceled" | "not_required";
export type OrderStateDomain = "order" | "payment" | "production" | "fulfillment";

export type StateByDomain = {
  order: OrderStatus;
  payment: PaymentStatus;
  production: ProductionStatus;
  fulfillment: FulfillmentStatus;
};

export const initialOrderStates: StateByDomain = {
  order: "pending_confirmation",
  payment: "pending",
  production: "pending_confirmation",
  fulfillment: "pending",
};

const transitions: { [K in OrderStateDomain]: Record<StateByDomain[K], readonly StateByDomain[K][]> } = {
  order: {
    pending_confirmation: ["confirmed", "rejected", "canceled"],
    confirmed: ["completed", "canceled"],
    rejected: [],
    canceled: [],
    completed: [],
  },
  payment: {
    pending: ["authorized", "paid", "failed"],
    authorized: ["paid", "failed"],
    paid: ["partially_refunded", "refunded"],
    failed: ["pending"],
    partially_refunded: ["refunded"],
    refunded: [],
  },
  production: {
    pending_confirmation: ["queued", "canceled", "not_required"],
    queued: ["preparing", "canceled"],
    preparing: ["ready", "canceled"],
    ready: ["canceled"],
    canceled: [],
    not_required: [],
  },
  fulfillment: {
    pending: ["awaiting_assignment", "awaiting_pickup", "served", "canceled", "not_required"],
    awaiting_assignment: ["assigned", "canceled"],
    assigned: ["picked_up", "canceled"],
    picked_up: ["out_for_delivery", "canceled"],
    out_for_delivery: ["delivered"],
    delivered: [],
    awaiting_pickup: ["picked_up_by_customer", "canceled"],
    picked_up_by_customer: [],
    served: [],
    canceled: [],
    not_required: [],
  },
};

export class InvalidOrderTransitionError extends Error {
  constructor(domain: OrderStateDomain, from: string, to: string) {
    super(`Invalid ${domain} transition: ${from} -> ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function canTransition<K extends OrderStateDomain>(domain: K, from: StateByDomain[K], to: StateByDomain[K]) {
  if (from === to) return true;
  return transitions[domain][from].includes(to);
}

export function assertTransition<K extends OrderStateDomain>(domain: K, from: StateByDomain[K], to: StateByDomain[K]) {
  if (!canTransition(domain, from, to)) throw new InvalidOrderTransitionError(domain, from, to);
}

export function fulfillmentIsComplete(status: FulfillmentStatus) {
  return status === "delivered" || status === "picked_up_by_customer" || status === "served" || status === "not_required";
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_confirmation: "Aguardando confirmação",
  confirmed: "Confirmado",
  rejected: "Recusado",
  canceled: "Cancelado",
  completed: "Concluído",
};

export const productionStatusLabels: Record<ProductionStatus, string> = {
  pending_confirmation: "Aguardando confirmação",
  queued: "Na fila",
  preparing: "Em preparo",
  ready: "Pronto",
  canceled: "Cancelado",
  not_required: "Sem produção",
};
