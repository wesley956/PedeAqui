export type KitchenProductionStatus = "pending_confirmation" | "queued" | "preparing" | "ready";

export type KitchenStation = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
};

export type KitchenModifier = {
  name: string;
  groupName: string;
};

export type KitchenItem = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  note: string | null;
  stationIds: string[];
  modifiers: KitchenModifier[];
};

export type KitchenOrder = {
  id: string;
  displayNumber: number;
  customerName: string;
  fulfillmentType: string;
  productionStatus: KitchenProductionStatus;
  confirmedAt: string | null;
  createdAt: string;
  items: KitchenItem[];
};

export type KitchenUrgency = "fresh" | "attention" | "late";

export const KITCHEN_ATTENTION_MINUTES = 12;
export const KITCHEN_LATE_MINUTES = 20;

export function kitchenStartedAt(order: Pick<KitchenOrder, "confirmedAt" | "createdAt">) {
  return order.confirmedAt ?? order.createdAt;
}

export function kitchenElapsedMinutes(order: Pick<KitchenOrder, "confirmedAt" | "createdAt">, now = Date.now()) {
  const startedAt = new Date(kitchenStartedAt(order)).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 60_000));
}

export function kitchenElapsedLabel(order: Pick<KitchenOrder, "confirmedAt" | "createdAt">, now = Date.now()) {
  const minutes = kitchenElapsedMinutes(order, now);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}min`;
}

export function kitchenUrgency(order: Pick<KitchenOrder, "confirmedAt" | "createdAt">, now = Date.now()): KitchenUrgency {
  const minutes = kitchenElapsedMinutes(order, now);
  if (minutes >= KITCHEN_LATE_MINUTES) return "late";
  if (minutes >= KITCHEN_ATTENTION_MINUTES) return "attention";
  return "fresh";
}

export function filterKitchenOrdersByStation(orders: KitchenOrder[], stationId: string | null) {
  if (!stationId) return orders;
  return orders
    .map((order) => ({
      ...order,
      items: order.items.filter((item) => item.stationIds.includes(stationId)),
    }))
    .filter((order) => order.items.length > 0);
}
