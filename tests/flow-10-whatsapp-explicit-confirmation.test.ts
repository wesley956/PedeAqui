import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createFromCheckout: vi.fn(),
  captureNotificationContext: vi.fn(),
  scheduleNotifications: vi.fn(),
}));

vi.mock("@/server/orders/order-service", () => ({
  OrderService: { createFromCheckout: mocks.createFromCheckout },
}));

vi.mock("@/server/conversations/order-notification-context-service", () => ({
  OrderNotificationContextService: { capture: mocks.captureNotificationContext },
}));

vi.mock("@/server/conversations/order-notification-dispatch", () => ({
  scheduleOrderWhatsAppNotifications: mocks.scheduleNotifications,
}));

import { WhatsAppOrderService } from "@/server/conversations/whatsapp-order-service";

const input = {
  organizationId: "organization-1",
  storeId: "store-1",
  storeSlug: "flow10-whatsapp-store",
  storeName: "FLOW-10 Store",
  contactName: "Cliente Técnico",
  contactPhone: "5519999991111",
  step: "order_confirmation" as const,
  context: {
    channel: "whatsapp_order" as const,
    version: 1 as const,
    cartToken: "flow10-cart-token",
    customerName: "Cliente Técnico",
    fulfillment: "pickup" as const,
    paymentMethod: "cash" as const,
  },
};

describe("FLOW-10 B07/B08 explicit WhatsApp confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFromCheckout.mockResolvedValue({
      order_id: "order-1",
      display_number: 101,
      accessToken: "technical-access-token",
    });
    mocks.captureNotificationContext.mockResolvedValue(true);
  });

  it.each(["talvez", "pode ser depois", "quero revisar"])(
    "does not create an order for non-explicit confirmation: %s",
    async (text) => {
      const result = await WhatsAppOrderService.handle({ ...input, text });

      expect(result.nextStep).toBe("order_confirmation");
      expect(result.body).toContain("Responda SIM");
      expect(mocks.createFromCheckout).not.toHaveBeenCalled();
      expect(mocks.scheduleNotifications).not.toHaveBeenCalled();
    },
  );

  it("cancels without creating an order when the customer says NAO", async () => {
    const result = await WhatsAppOrderService.handle({ ...input, text: "NÃO" });

    expect(result.nextStep).toBe("menu");
    expect(result.context).toBeNull();
    expect(mocks.createFromCheckout).not.toHaveBeenCalled();
  });

  it("uses the official checkout once with the WhatsApp channel after SIM", async () => {
    const result = await WhatsAppOrderService.handle({ ...input, text: "SIM" });

    expect(mocks.createFromCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.createFromCheckout).toHaveBeenCalledWith(
      "flow10-whatsapp-store",
      "flow10-cart-token",
      "whatsapp",
    );
    expect(mocks.captureNotificationContext).toHaveBeenCalledWith(
      "order-1",
      "technical-access-token",
    );
    expect(mocks.scheduleNotifications).toHaveBeenCalledWith(
      "checkout.order_created",
      "order-1",
    );
    expect(result.nextStep).toBe("menu");
    expect(result.context).toBeNull();
    expect(result.body).toContain("Pedido #101 criado com sucesso pelo WhatsApp");
  });
});
