import { describe, expect, it } from "vitest";
import type { CanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";
import { validateCanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";

function validOrder(): CanonicalExternalOrder {
  return {
    provider: "ifood",
    externalMerchantId: "merchant-1",
    externalOrderId: "external-order-1",
    externalDisplayId: "1234",
    orderType: "delivery",
    timing: "immediate",
    createdAt: "2026-09-06T00:00:00.000Z",
    scheduledFor: null,
    recommendedPreparationAt: null,
    customer: { name: "Cliente", phone: null },
    deliveryAddress: {
      street: "Rua A",
      number: "10",
      neighborhood: "Centro",
      city: "Cidade",
      state: "SP",
      postalCode: null,
      complement: null,
      reference: null,
      latitude: null,
      longitude: null,
    },
    items: [{
      externalId: "item-1",
      name: "Lanche",
      quantity: 1,
      unitBasePriceCents: 2000,
      totalCents: 2500,
      notes: "Sem cebola",
      modifiers: [{
        externalId: "mod-1",
        name: "Adicional",
        quantity: 1,
        unitPriceCents: 500,
        totalCents: 500,
      }],
    }],
    money: {
      subtotalCents: 2500,
      deliveryFeeCents: 500,
      discountCents: 200,
      additionalFeeCents: 100,
      totalCents: 2900,
    },
    payments: [{ method: "provider_wallet", prepaid: true, amountCents: 2900, providerStatus: "PAID" }],
    paymentOwner: "provider",
    logisticsOwner: "ifood",
    pickupCode: null,
    deliveryCode: "1234",
    providerMetadata: { source: "sandbox_fixture_shape" },
  };
}

describe("canonical external order validation", () => {
  it("accepts an operationally complete provider-neutral snapshot", () => {
    expect(validateCanonicalExternalOrder(validOrder())).toEqual({ valid: true });
  });

  it("rejects financial totals that do not reconcile", () => {
    const order = validOrder();
    order.money.totalCents = 9999;
    expect(validateCanonicalExternalOrder(order)).toEqual({ valid: false, errors: ["order_total_invariant_failed"] });
  });

  it("requires a delivery address for delivery orders", () => {
    const order = validOrder();
    order.deliveryAddress = null;
    const result = validateCanonicalExternalOrder(order);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain("delivery_address_required");
  });

  it("requires scheduledFor only for scheduled orders", () => {
    const order = validOrder();
    order.timing = "scheduled";
    const result = validateCanonicalExternalOrder(order);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain("scheduled_for_required");
  });

  it("requires a payment snapshot when the provider owns payment", () => {
    const order = validOrder();
    order.payments = [];
    const result = validateCanonicalExternalOrder(order);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain("provider_payment_snapshot_required");
  });
});
