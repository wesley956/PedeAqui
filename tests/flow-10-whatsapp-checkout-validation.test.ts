import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  saveIdentity: vi.fn(),
  saveFulfillment: vi.fn(),
  saveAddress: vi.fn(),
  savePayment: vi.fn(),
  loadCheckout: vi.fn(),
  listPaymentMethods: vi.fn(),
}));

vi.mock("@/server/checkout/checkout-service", () => ({
  CheckoutError: class CheckoutError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
  CheckoutService: {
    saveIdentity: mocks.saveIdentity,
    saveFulfillment: mocks.saveFulfillment,
    saveAddress: mocks.saveAddress,
    savePayment: mocks.savePayment,
    load: mocks.loadCheckout,
  },
}));

vi.mock("@/server/payments/store-payment-method-service", () => ({
  StorePaymentMethodService: { listForStore: mocks.listPaymentMethods },
}));

import { WhatsAppOrderService } from "@/server/conversations/whatsapp-order-service";

const organizationId = "73000000-0000-4000-8000-000000000001";
const storeId = "73000000-0000-4000-8000-000000000002";
const cartToken = "flow10-official-checkout-token";

const baseInput = {
  organizationId,
  storeId,
  storeSlug: "flow10-technical-store",
  storeName: "FLOW-10 Technical Store",
  contactName: "Cliente Técnico",
  contactPhone: "5500000000000",
};

const baseContext = {
  channel: "whatsapp_order" as const,
  version: 1 as const,
  cartToken,
  customerName: "Cliente Técnico",
};

describe("FLOW-10 B05/B06 official WhatsApp checkout validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPaymentMethods.mockResolvedValue([
      { method: "credit_card", enabled: true, sortOrder: 10 },
      { method: "cash", enabled: true, sortOrder: 20 },
    ]);
    mocks.loadCheckout.mockResolvedValue({
      cart: {
        total_cents: 2500,
        items: [{ quantity: 1, product_name_snapshot: "Produto Técnico", line_total_cents: 2500 }],
      },
    });
  });

  it("B05 persists identity through the official checkout service and same cart token", async () => {
    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      step: "order_name",
      text: "Cliente Técnico",
      context: { channel: "whatsapp_order", version: 1, cartToken },
    });

    expect(mocks.saveIdentity).toHaveBeenCalledWith(
      "flow10-technical-store",
      cartToken,
      { name: "Cliente Técnico", phone: "5500000000000", email: null },
    );
    expect(result.nextStep).toBe("order_fulfillment");
    expect(result.context).toMatchObject({ cartToken, customerName: "Cliente Técnico" });
  });

  it("B06 rejects an unknown fulfillment before writing checkout state", async () => {
    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      step: "order_fulfillment",
      text: "teletransporte",
      context: baseContext,
    });

    expect(result.nextStep).toBe("order_fulfillment");
    expect(result.body).toContain("1 — Entrega");
    expect(mocks.saveFulfillment).not.toHaveBeenCalled();
    expect(mocks.listPaymentMethods).not.toHaveBeenCalled();
  });

  it("B06 validates pickup, then loads payment methods from the scoped store", async () => {
    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      step: "order_fulfillment",
      text: "2",
      context: baseContext,
    });

    expect(mocks.saveFulfillment).toHaveBeenCalledWith(
      "flow10-technical-store",
      cartToken,
      "pickup",
    );
    expect(mocks.listPaymentMethods).toHaveBeenCalledWith(organizationId, storeId);
    expect(result.nextStep).toBe("order_payment");
    expect(result.body).toContain("1 — Cartão de crédito");
    expect(result.context).toMatchObject({ cartToken, fulfillment: "pickup" });
  });

  it("B06 keeps invalid payment outside confirmation without saving it", async () => {
    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      step: "order_payment",
      text: "vale inventado",
      context: { ...baseContext, fulfillment: "pickup" as const },
    });

    expect(mocks.listPaymentMethods).toHaveBeenCalledWith(organizationId, storeId);
    expect(mocks.savePayment).not.toHaveBeenCalled();
    expect(mocks.loadCheckout).not.toHaveBeenCalled();
    expect(result.nextStep).toBe("order_payment");
  });

  it("B05/B06 save a valid payment and review the same official checkout before confirmation", async () => {
    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      step: "order_payment",
      text: "1",
      context: { ...baseContext, fulfillment: "pickup" as const },
    });

    expect(mocks.savePayment).toHaveBeenCalledWith(
      "flow10-technical-store",
      cartToken,
      { method: "credit_card", customPaymentMethodId: null, cashChangeForCents: null },
    );
    expect(mocks.loadCheckout).toHaveBeenCalledWith("flow10-technical-store", cartToken);
    expect(result.nextStep).toBe("order_confirmation");
    expect(result.body).toContain("Produto Técnico");
    expect(result.body).toContain("Pagamento: Cartão de crédito");
    expect(result.context).toMatchObject({
      cartToken,
      fulfillment: "pickup",
      paymentMethod: "credit_card",
      paymentLabel: "Cartão de crédito",
    });
  });
});
