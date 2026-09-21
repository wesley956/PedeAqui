import { describe, expect, it } from "vitest";

import { buildOrderLookupMessage, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { projectOrderNotification, projectOrderTrackingState } from "@/server/conversations/order-tracking-projection";

const order = {
  displayNumber: 944,
  trackingUrl: "https://pedeaqui.example/m/flow10-final-store/pedido/78000000-0000-4000-8000-000000000003/acesso",
};

describe("FLOW-10 A07-A11 final public lifecycle", () => {
  it("A07 projects a newly created order as recebido", () => {
    const notification = projectOrderNotification("order_received");
    const tracking = projectOrderTrackingState({
      fulfillmentType: "delivery",
      orderStatus: "pending",
      productionStatus: "pending",
      fulfillmentStatus: "pending",
    });
    expect(notification).toMatchObject({ stage: "received", statusText: "Pedido recebido" });
    expect(tracking).toMatchObject({ stage: "received", statusText: "Pedido recebido" });
  });

  it("A08 converges store confirmation to confirmado", () => {
    const notification = projectOrderNotification("order_confirmed");
    const tracking = projectOrderTrackingState({
      fulfillmentType: "delivery",
      orderStatus: "confirmed",
      productionStatus: "pending",
      fulfillmentStatus: "pending",
    });
    expect(notification.stage).toBe("confirmed");
    expect(tracking).toMatchObject({ stage: "confirmed", statusText: "Pedido confirmado" });
  });

  it("A09 converges production preparing across notification and tracking", () => {
    const notification = projectOrderNotification("production_preparing");
    const tracking = projectOrderTrackingState({
      fulfillmentType: "delivery",
      orderStatus: "confirmed",
      productionStatus: "preparing",
      fulfillmentStatus: "pending",
    });
    expect(notification.stage).toBe("preparing");
    expect(tracking).toMatchObject({ stage: "preparing", statusText: "Pedido em preparo" });
  });

  it("A10 reaches delivery completion on the same public order projection", () => {
    const delivering = projectOrderTrackingState({
      fulfillmentType: "delivery",
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "out_for_delivery",
    });
    const deliveredNotification = projectOrderNotification("delivered");
    const delivered = projectOrderTrackingState({
      fulfillmentType: "delivery",
      orderStatus: "completed",
      productionStatus: "ready",
      fulfillmentStatus: "delivered",
    });
    expect(delivering.stage).toBe("out_for_delivery");
    expect(deliveredNotification.stage).toBe("delivered");
    expect(delivered).toMatchObject({ stage: "delivered", terminal: true, statusText: "Pedido entregue" });
  });

  it("A11 understands onde esta meu pedido and reports the latest public stage", () => {
    expect(resolveWhatsAppBotIntent("onde está meu pedido?", "menu")).toBe("track_start");
    const reply = buildOrderLookupMessage({
      displayNumber: order.displayNumber,
      orderStatus: "completed",
      productionStatus: "ready",
      fulfillmentStatus: "delivered",
      trackingUrl: order.trackingUrl,
      visibleStage: "finished",
    });
    expect(reply).toContain("pedido #944");
    expect(reply).toContain("Etapa atual: Pedido entregue");
    expect(reply).toContain(order.trackingUrl);
  });
});
