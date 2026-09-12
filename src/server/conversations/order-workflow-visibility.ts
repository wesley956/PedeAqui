import {
  deliveryWorkflowStages,
  foldStageToVisible,
  parseCustomWorkflowConfig,
  pickupWorkflowStages,
  type CustomWorkflowConfig,
  type DeliveryWorkflowStage,
  type OrderWorkflowMode,
  type PickupWorkflowStage,
  type WorkflowStage,
} from "@/features/orders/workflow-config";
import type { OrderNotificationType } from "@/server/conversations/order-notification-template";

export type OrderFulfillmentType = "delivery" | "pickup" | "dine_in" | "table" | string;
export type WorkflowNotificationCheckpoint = WorkflowStage | "payment" | "canceled";

export type PersistedOrderWorkflowSettings = {
  orders_workflow_mode?: string | null;
  orders_custom_workflow?: unknown;
};

export type OrderStateSnapshot = {
  fulfillmentType: OrderFulfillmentType;
  orderStatus: string;
  productionStatus: string;
  fulfillmentStatus: string;
};

const simplifiedDeliveryStages = ["new", "ready", "delivering", "finished"] as const;
const simplifiedPickupStages = ["new", "ready", "finished"] as const;

const notificationStage: Partial<Record<OrderNotificationType, WorkflowStage>> = {
  order_received: "new",
  order_confirmed: "new",
  production_preparing: "preparing",
  pickup_ready: "ready",
  pickup_completed: "finished",
  out_for_delivery: "delivering",
  delivered: "finished",
};

function normalizeMode(value: string | null | undefined): OrderWorkflowMode {
  return value === "simplified" || value === "custom" ? value : "standard";
}

function isDelivery(fulfillmentType: OrderFulfillmentType) {
  return fulfillmentType === "delivery";
}

export function resolveWorkflowSettings(value: PersistedOrderWorkflowSettings) {
  return {
    mode: normalizeMode(value.orders_workflow_mode),
    custom: parseCustomWorkflowConfig(value.orders_custom_workflow),
  };
}

export function visibleWorkflowStages(input: {
  mode: OrderWorkflowMode;
  custom: CustomWorkflowConfig;
  fulfillmentType: OrderFulfillmentType;
}): readonly WorkflowStage[] {
  if (input.mode === "custom") {
    return isDelivery(input.fulfillmentType) ? input.custom.delivery : input.custom.pickup;
  }
  if (input.mode === "simplified") {
    return isDelivery(input.fulfillmentType) ? simplifiedDeliveryStages : simplifiedPickupStages;
  }
  return isDelivery(input.fulfillmentType) ? deliveryWorkflowStages : pickupWorkflowStages;
}

export function rawWorkflowStage(order: OrderStateSnapshot): WorkflowStage {
  if (["completed", "canceled", "rejected"].includes(order.orderStatus)) return "finished";
  if (order.orderStatus === "pending_confirmation") return "new";
  if (["pending_confirmation", "queued", "preparing"].includes(order.productionStatus)) return "preparing";
  if (isDelivery(order.fulfillmentType)) {
    if (["assigned", "picked_up", "out_for_delivery"].includes(order.fulfillmentStatus)) return "delivering";
    if (order.fulfillmentStatus === "delivered") return "finished";
    return "ready";
  }
  if (order.fulfillmentStatus === "awaiting_pickup") return "awaiting_pickup";
  if (["picked_up_by_customer", "served"].includes(order.fulfillmentStatus)) return "finished";
  return "ready";
}

export function visibleWorkflowStage(
  order: OrderStateSnapshot,
  settings: PersistedOrderWorkflowSettings,
): WorkflowStage {
  const workflow = resolveWorkflowSettings(settings);
  const raw = rawWorkflowStage(order);
  const selected = visibleWorkflowStages({ ...workflow, fulfillmentType: order.fulfillmentType });
  if (isDelivery(order.fulfillmentType)) {
    return foldStageToVisible(
      raw as DeliveryWorkflowStage,
      selected as readonly DeliveryWorkflowStage[],
      deliveryWorkflowStages,
    );
  }
  const compatibleRaw: PickupWorkflowStage = raw === "delivering" ? "ready" : raw as PickupWorkflowStage;
  return foldStageToVisible(
    compatibleRaw,
    selected as readonly PickupWorkflowStage[],
    pickupWorkflowStages,
  );
}

export function resolveNotificationWorkflowVisibility(input: {
  type: OrderNotificationType;
  fulfillmentType: OrderFulfillmentType;
  settings: PersistedOrderWorkflowSettings;
}) {
  if (input.type === "payment_paid") {
    return { eligible: true, checkpoint: "payment" as const, stage: null };
  }
  if (input.type === "order_canceled") {
    return { eligible: true, checkpoint: "canceled" as const, stage: null };
  }

  if (isDelivery(input.fulfillmentType) && (input.type === "pickup_ready" || input.type === "pickup_completed")) {
    return { eligible: false, checkpoint: null, stage: notificationStage[input.type] ?? null };
  }
  if (!isDelivery(input.fulfillmentType) && (input.type === "out_for_delivery" || input.type === "delivered")) {
    return { eligible: false, checkpoint: null, stage: notificationStage[input.type] ?? null };
  }

  const stage = notificationStage[input.type];
  if (!stage) return { eligible: false, checkpoint: null, stage: null };
  if (isDelivery(input.fulfillmentType) && stage === "awaiting_pickup") {
    return { eligible: false, checkpoint: null, stage };
  }
  if (!isDelivery(input.fulfillmentType) && stage === "delivering") {
    return { eligible: false, checkpoint: null, stage };
  }

  const workflow = resolveWorkflowSettings(input.settings);
  const selected = visibleWorkflowStages({ ...workflow, fulfillmentType: input.fulfillmentType });
  return {
    eligible: selected.includes(stage),
    checkpoint: stage as WorkflowNotificationCheckpoint,
    stage,
  };
}

export function workflowEligibilityByNotification(settings: PersistedOrderWorkflowSettings) {
  return {
    order_received: true,
    order_confirmed: true,
    production_preparing:
      resolveNotificationWorkflowVisibility({ type: "production_preparing", fulfillmentType: "delivery", settings }).eligible
      || resolveNotificationWorkflowVisibility({ type: "production_preparing", fulfillmentType: "pickup", settings }).eligible,
    payment_paid: true,
    pickup_ready: resolveNotificationWorkflowVisibility({ type: "pickup_ready", fulfillmentType: "pickup", settings }).eligible,
    pickup_completed: resolveNotificationWorkflowVisibility({ type: "pickup_completed", fulfillmentType: "pickup", settings }).eligible,
    out_for_delivery: resolveNotificationWorkflowVisibility({ type: "out_for_delivery", fulfillmentType: "delivery", settings }).eligible,
    delivered: resolveNotificationWorkflowVisibility({ type: "delivered", fulfillmentType: "delivery", settings }).eligible,
    order_canceled: true,
  } satisfies Record<OrderNotificationType, boolean>;
}
