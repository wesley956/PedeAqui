import { describe, expect, it } from "vitest";
import {
  assertFixtureHasNoObviousPii,
  sanitizeIfoodSandboxOrder,
} from "../scripts/sanitize-ifood-sandbox-fixture.mjs";
import { normalizeIfoodOrderDetails } from "@/server/integrations/providers/ifood/ifood-orders-model";

const raw = {
  id: "real-sandbox-order-id",
  displayId: "A1B2",
  status: "PLACED",
  orderType: "DELIVERY",
  orderTiming: "IMMEDIATE",
  salesChannel: "IFOOD",
  category: "FOOD",
  createdAt: "2026-09-08T12:00:00.000Z",
  merchant: { id: "real-merchant-id", name: "Real merchant" },
  customer: { name: "Maria da Silva", phone: { number: "+5511999999999", localizer: "123456" } },
  items: [{
    id: "real-item-id",
    uniqueId: "real-item-unique-id",
    name: "Hambúrguer teste",
    quantity: 2,
    unitPrice: 20,
    price: 40,
    totalPrice: 45,
    observations: "Entregar para Maria no portão azul",
    options: [{ id: "real-option-id", name: "Bacon", quantity: 1, unitPrice: 3, addition: 2, price: 5 }],
  }],
  benefits: [{ value: 4, sponsorshipValues: [{ name: "IFOOD", value: 4 }] }],
  total: { subTotal: 45, deliveryFee: 5, benefits: 4, additionalFees: 1, orderAmount: 47 },
  payments: { prepaid: 47, pending: 0, methods: [{ value: 47, type: "ONLINE", method: "PIX", currency: "BRL" }] },
  delivery: {
    deliveredBy: "IFOOD",
    mode: "DEFAULT",
    pickupCode: "9876",
    deliveryAddress: {
      streetName: "Rua Real",
      streetNumber: "123",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
      complement: "Apto 22",
      reference: "Portão azul",
      coordinates: { latitude: -23.55, longitude: -46.63 },
    },
  },
  extraInfo: "ligar ao chegar",
};

describe("iFood real sandbox fixture sanitizer", () => {
  it("removes direct PII/identifiers while preserving financial and structural truth", () => {
    const sanitized = sanitizeIfoodSandboxOrder(raw);
    expect(() => assertFixtureHasNoObviousPii(sanitized)).not.toThrow();
    expect(sanitized.customer.name).toBe("SANITIZED CUSTOMER");
    expect(sanitized.customer.phone.number).toBe("00000000000");
    expect(sanitized.delivery.deliveryAddress.streetName).toBe("SANITIZED STREET");
    expect(sanitized.items[0].observations).toBe("[SANITIZED OBSERVATION]");

    expect(sanitized.items[0].name).toBe(raw.items[0].name);
    expect(sanitized.items[0].quantity).toBe(2);
    expect(sanitized.items[0].unitPrice).toBe(20);
    expect(sanitized.items[0].options[0].name).toBe("Bacon");
    expect(sanitized.items[0].options[0].addition).toBe(2);
    expect(sanitized.total).toEqual(raw.total);
    expect(sanitized.payments).toEqual(raw.payments);
  });

  it("feeds the same production normalizer with deterministic sanitized identities", () => {
    const sanitized = sanitizeIfoodSandboxOrder(raw);
    const canonical = normalizeIfoodOrderDetails(sanitized, "sandbox-merchant-001");

    expect(canonical.externalOrderId).toBe("sandbox-order-001");
    expect(canonical.externalMerchantId).toBe("sandbox-merchant-001");
    expect(canonical.items).toEqual([
      expect.objectContaining({
        name: "Hambúrguer teste",
        quantity: 2,
        unitBasePriceCents: 2000,
        totalCents: 4500,
        notes: "[SANITIZED OBSERVATION]",
        modifiers: [expect.objectContaining({ name: "Bacon", quantity: 1, unitPriceCents: 500, totalCents: 500 })],
      }),
    ]);
    expect(canonical.money).toEqual({
      subtotalCents: 4500,
      deliveryFeeCents: 500,
      discountCents: 400,
      additionalFeeCents: 100,
      totalCents: 4700,
    });
    expect(canonical.paymentOwner).toBe("provider");
    expect(canonical.logisticsOwner).toBe("ifood");
  });
});
