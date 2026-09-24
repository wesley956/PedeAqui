import {
  deliveryWorkflowStages,
  foldStageToVisible,
  pickupWorkflowStages,
  type DeliveryWorkflowStage,
  type PickupWorkflowStage,
  type WorkflowStage,
} from "@/features/orders/workflow-config";
import type { OrderNotificationType } from "@/server/conversations/order-notification-template";
import {
  resolveWorkflowSettings,
  visibleWorkflowStages,
  type OrderStateSnapshot,
  type PersistedOrderWorkflowSettings,
} from "@/server/conversations/order-workflow-visibility";

export type OrderTrackingPublicStage =
  | "received"
  | "confirmed"
  | "preparing"
  | "ready"
  | "pickup_ready"
  | "pickup_completed"
  | "out_for_delivery"
  | "delivered"
  | "canceled";

export type OrderTrackingCheckpoint = OrderTrackingPublicStage | "payment_confirmed";

export type OrderTrackingProjection = {
  kind: "operational" | "informational";
  stage: OrderTrackingPublicStage | null;
  checkpoint: OrderTrackingCheckpoint;
  statusText: string;
  workflowStage: WorkflowStage | null;
  nextAction: string | null;
  terminal: boolean;
};

const notificationProjection: Record<OrderNotificationType, Omit<OrderTrackingProjection, "workflowStage">> = {
  order_received: {
    kind: "operational", stage: "received", checkpoint: "received", statusText: "Pedido recebido",
    nextAction: "A loja vai confirmar o pedido.", terminal: false,
  },
  order_confirmed: {
    kind: "operational", stage: "confirmed", checkpoint: "confirmed", statusText: "Pedido confirmado",
    nextAction: "Aguarde o início do preparo.", terminal: false,
  },
  production_preparing: {
    kind: "operational", stage: "preparing", checkpoint: "preparing", statusText: "Pedido em preparo",
    nextAction: "A loja está preparando seu pedido.", terminal: false,
  },
  payment_paid: {
    kind: "informational", stage: null, checkpoint: "payment_confirmed", statusText: "Pagamento confirmado",
    nextAction: null, terminal: false,
  },
  pickup_ready: {
    kind: "operational", stage: "pickup_ready", checkpoint: "pickup_ready", statusText: "Pronto para retirada",
    nextAction: "Seu pedido pode ser retirado na loja.", terminal: false,
  },
  pickup_completed: {
    kind: "operational", stage: "pickup_completed", checkpoint: "pickup_completed", statusText: "Pedido retirado",
    nextAction: null, terminal: true,
  },
  out_for_delivery: {
    kind: "operational", stage: "out_for_delivery", checkpoint: "out_for_delivery", statusText: "Saiu para entrega",
    nextAction: "Seu pedido está a caminho.", terminal: false,
  },
  delivered: {
    kind: "operational", stage: "delivered", checkpoint: "delivered", statusText: "Pedido entregue",
    nextAction: null, terminal: true,
  },
  order_canceled: {
    kind: "operational", stage: "canceled", checkpoint: "canceled", statusText: "Pedido cancelado",
    nextAction: null, terminal: true,
  },
};

function isDelivery(fulfillmentType: string) {
  return fulfillmentType === "delivery";
}

function foldConservativeStage(
  stage: WorkflowStage,
  order: OrderStateSnapshot,
  settings: PersistedOrderWorkflowSettings,
): WorkflowStage {
  const workflow = resolveWorkflowSettings(settings);
  const selected = visibleWorkflowStages({ ...workflow, fulfillmentType: order.fulfillmentType });
  if (isDelivery(order.fulfillmentType)) {
    return foldStageToVisible(
      stage as DeliveryWorkflowStage,
      selected as readonly DeliveryWorkflowStage[],
      deliveryWorkflowStages,
    );
  }
  const compatible = stage === "delivering" ? "ready" : stage as PickupWorkflowStage;
  return foldStageToVisible(
    compatible,
    selected as readonly PickupWorkflowStage[],
    pickupWorkflowStages,
  );
}

function projectionForVisibleStage(
  visible: WorkflowStage,
  order: OrderStateSnapshot,
): OrderTrackingProjection {
  if (visible === "new") {
    const confirmed = order.orderStatus === "confirmed";
    return {
      kind: "operational",
      stage: confirmed ? "confirmed" : "received",
      checkpoint: confirmed ? "confirmed" : "received",
      statusText: confirmed ? "Pedido confirmado" : "Pedido recebido",
      workflowStage: visible,
      nextAction: confirmed ? "Aguarde o próximo avanço do pedido." : "A loja vai confirmar o pedido.",
      terminal: false,
    };
  }
  if (visible === "preparing") {
    return { ...projectOrderNotification("production_preparing"), workflowStage: visible };
  }
  if (visible === "delivering") {
    return { ...projectOrderNotification("out_for_delivery"), workflowStage: visible };
  }
  if (visible === "awaiting_pickup") {
    return { ...projectOrderNotification("pickup_ready"), workflowStage: visible };
  }
  if (visible === "finished") {
    return {
      ...projectOrderNotification(isDelivery(order.fulfillmentType) ? "delivered" : "pickup_completed"),
      workflowStage: visible,
    };
  }
  return {
    kind: "operational",
    stage: "ready",
    checkpoint: "ready",
    statusText: "Pedido pronto",
    workflowStage: visible,
    nextAction: isDelivery(order.fulfillmentType)
      ? "Aguarde a saída para entrega."
      : "Aguarde a liberação para retirada.",
    terminal: false,
  };
}

/**
 * Canonical public projection of the current order state.
 *
 * Internal/transitional states deliberately do not advance the public stage:
 * - production `queued` remains confirmed until `preparing`;
 * - delivery `assigned`/`picked_up` remains ready until `out_for_delivery`.
 */
export function projectOrderTrackingState(
  order: OrderStateSnapshot,
  settings: PersistedOrderWorkflowSettings = {},
): OrderTrackingProjection {
  if (order.orderStatus === "canceled" || order.orderStatus === "rejected"
    || order.productionStatus === "canceled" || order.fulfillmentStatus === "canceled") {
    return { ...projectOrderNotification("order_canceled"), workflowStage: "finished" };
  }

  if (order.fulfillmentStatus === "delivered") {
    return { ...projectOrderNotification("delivered"), workflowStage: "finished" };
  }
  if (order.fulfillmentStatus === "picked_up_by_customer" || order.fulfillmentStatus === "served") {
    return { ...projectOrderNotification("pickup_completed"), workflowStage: "finished" };
  }
  if (order.orderStatus === "completed") {
    return {
      ...projectOrderNotification(isDelivery(order.fulfillmentType) ? "delivered" : "pickup_completed"),
      workflowStage: "finished",
    };
  }

  let raw: WorkflowStage = "new";
  if (isDelivery(order.fulfillmentType) && order.fulfillmentStatus === "out_for_delivery") {
    raw = "delivering";
  } else if (!isDelivery(order.fulfillmentType) && order.fulfillmentStatus === "awaiting_pickup") {
    raw = "awaiting_pickup";
  } else if (order.productionStatus === "ready") {
    raw = "ready";
  } else if (order.productionStatus === "preparing") {
    raw = "preparing";
  }

  const visible = foldConservativeStage(raw, order, settings);
  const projection = projectionForVisibleStage(visible, order);

  // A pickup order explicitly released for pickup stays "Pronto para retirada" even
  // when a simplified/custom workflow folds awaiting_pickup into the visible ready stage.
  if (!isDelivery(order.fulfillmentType) && order.fulfillmentStatus === "awaiting_pickup" && visible === "ready") {
    return { ...projectOrderNotification("pickup_ready"), workflowStage: visible };
  }

  return projection;
}

export function projectOrderNotification(type: OrderNotificationType): OrderTrackingProjection {
  return { ...notificationProjection[type], workflowStage: null };
}
