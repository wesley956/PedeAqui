import { describe, expect, it } from "vitest";
import { buildOrderLookupMessage } from "@/server/conversations/bot-menu";
import { notificationStatusText } from "@/server/conversations/order-notification-model";
import {
  projectOrderNotification,
  projectOrderTrackingState,
} from "@/server/conversations/order-tracking-projection";

function delivery(overrides: Partial<Parameters<typeof projectOrderTrackingState>[0]> = {}) {
  return {
    fulfillmentType: "delivery",
    orderStatus: "confirmed",
    productionStatus: "pending_confirmation",
    fulfillmentStatus: "pending",
    ...overrides,
  };
}

function pickup(overrides: Partial<Parameters<typeof projectOrderTrackingState>[0]> = {}) {
  return {
    fulfillmentType: "pickup",
    orderStatus: "confirmed",
    productionStatus: "pending_confirmation",
    fulfillmentStatus: "pending",
    ...overrides,
  };
}

describe("FLOW-07 canonical order tracking projection", () => {
  it("projects the public lifecycle without leaking internal transitions", () => {
    expect(projectOrderTrackingState(delivery({ orderStatus: "pending_confirmation" })).statusText)
      .toBe("Pedido recebido");
    expect(projectOrderTrackingState(delivery()).statusText).toBe("Pedido confirmado");
    expect(projectOrderTrackingState(delivery({ productionStatus: "queued" })).statusText)
      .toBe("Pedido confirmado");
    expect(projectOrderTrackingState(delivery({ productionStatus: "preparing" })).statusText)
      .toBe("Pedido em preparo");
    expect(projectOrderTrackingState(delivery({ productionStatus: "ready" })).statusText)
      .toBe("Pedido pronto");
    expect(projectOrderTrackingState(delivery({ productionStatus: "ready", fulfillmentStatus: "assigned" })).statusText)
      .toBe("Pedido pronto");
    expect(projectOrderTrackingState(delivery({ productionStatus: "ready", fulfillmentStatus: "picked_up" })).statusText)
      .toBe("Pedido pronto");
    expect(projectOrderTrackingState(delivery({ productionStatus: "ready", fulfillmentStatus: "out_for_delivery" })).statusText)
      .toBe("Saiu para entrega");
    expect(projectOrderTrackingState(delivery({ orderStatus: "completed", fulfillmentStatus: "delivered" })).statusText)
      .toBe("Pedido entregue");
  });

  it("projects pickup checkpoints independently from delivery", () => {
    expect(projectOrderTrackingState(pickup({ productionStatus: "preparing" })).statusText)
      .toBe("Pedido em preparo");
    expect(projectOrderTrackingState(pickup({ productionStatus: "ready" })).statusText)
      .toBe("Pedido pronto");
    expect(projectOrderTrackingState(pickup({ productionStatus: "ready", fulfillmentStatus: "awaiting_pickup" })).statusText)
      .toBe("Pronto para retirada");
    expect(projectOrderTrackingState(pickup({ orderStatus: "completed", fulfillmentStatus: "picked_up_by_customer" })).statusText)
      .toBe("Pedido retirado");
  });

  it("keeps canceled and rejected orders terminal", () => {
    for (const orderStatus of ["canceled", "rejected"]) {
      const projection = projectOrderTrackingState(delivery({ orderStatus, productionStatus: "preparing" }));
      expect(projection.statusText).toBe("Pedido cancelado");
      expect(projection.terminal).toBe(true);
    }
  });

  it("folds hidden preparing stage in simplified workflow without exposing it", () => {
    const projection = projectOrderTrackingState(
      delivery({ productionStatus: "preparing" }),
      { orders_workflow_mode: "simplified" },
    );
    expect(projection.statusText).toBe("Pedido confirmado");
    expect(projection.workflowStage).toBe("new");
  });

  it("keeps pickup-ready semantics when simplified workflow folds awaiting_pickup into ready", () => {
    const projection = projectOrderTrackingState(
      pickup({ productionStatus: "ready", fulfillmentStatus: "awaiting_pickup" }),
      { orders_workflow_mode: "simplified" },
    );
    expect(projection.statusText).toBe("Pronto para retirada");
    expect(projection.workflowStage).toBe("ready");
  });

  it("uses one canonical status vocabulary for push checkpoints", () => {
    const expected = {
      order_received: "Pedido recebido",
      order_confirmed: "Pedido confirmado",
      production_preparing: "Pedido em preparo",
      payment_paid: "Pagamento confirmado",
      pickup_ready: "Pronto para retirada",
      pickup_completed: "Pedido retirado",
      out_for_delivery: "Saiu para entrega",
      delivered: "Pedido entregue",
      order_canceled: "Pedido cancelado",
    } as const;

    for (const [type, statusText] of Object.entries(expected)) {
      const notificationType = type as keyof typeof expected;
      expect(projectOrderNotification(notificationType).statusText).toBe(statusText);
      expect(notificationStatusText(notificationType)).toBe(statusText);
    }
  });

  it("treats payment confirmation as informational instead of replacing the operational stage", () => {
    const payment = projectOrderNotification("payment_paid");
    expect(payment.kind).toBe("informational");
    expect(payment.stage).toBeNull();
    expect(payment.statusText).toBe("Pagamento confirmado");
  });

  it("produces the same lookup wording as the canonical operational checkpoint", () => {
    const cases = [
      {
        input: { displayNumber: 42, orderStatus: "confirmed", productionStatus: "preparing", fulfillmentStatus: "pending", visibleStage: "preparing" as const },
        type: "production_preparing" as const,
      },
      {
        input: { displayNumber: 42, orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "awaiting_pickup", visibleStage: "awaiting_pickup" as const },
        type: "pickup_ready" as const,
      },
      {
        input: { displayNumber: 42, orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "out_for_delivery", visibleStage: "delivering" as const },
        type: "out_for_delivery" as const,
      },
      {
        input: { displayNumber: 42, orderStatus: "completed", productionStatus: "ready", fulfillmentStatus: "delivered", visibleStage: "finished" as const },
        type: "delivered" as const,
      },
    ];

    for (const testCase of cases) {
      const message = buildOrderLookupMessage(testCase.input);
      expect(message).toContain(projectOrderNotification(testCase.type).statusText);
    }
  });

  it("does not let legacy visible-stage calculation leak queued or assigned states", () => {
    const queued = buildOrderLookupMessage({
      displayNumber: 7,
      orderStatus: "confirmed",
      productionStatus: "queued",
      fulfillmentStatus: "pending",
      visibleStage: "preparing",
    });
    expect(queued).toContain("Pedido confirmado");
    expect(queued).not.toContain("preparo");

    const assigned = buildOrderLookupMessage({
      displayNumber: 8,
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "assigned",
      visibleStage: "delivering",
    });
    expect(assigned).toContain("Pedido pronto");
    expect(assigned).not.toContain("Saiu para entrega");
  });

  it("is deterministic for duplicate snapshots", () => {
    const snapshot = delivery({ productionStatus: "preparing" });
    expect(projectOrderTrackingState(snapshot)).toEqual(projectOrderTrackingState(snapshot));
  });
});
