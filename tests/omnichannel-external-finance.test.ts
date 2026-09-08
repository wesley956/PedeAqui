import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectExternalFinance,
  summarizeExternalChannels,
} from "@/server/finance/external-channel-finance";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("external marketplace finance projection", () => {
  it("projects only financial fields and ignores customer/address PII", () => {
    const projected = projectExternalFinance({
      order_id: "order-1",
      provider: "ifood",
      payment_owner: "provider",
      last_snapshot: {
        customer: { name: "Cliente Secreto", phone: "11999999999" },
        deliveryAddress: { street: "Rua Privada", number: "10" },
        money: {
          subtotalCents: 2500,
          deliveryFeeCents: 500,
          discountCents: 300,
          additionalFeeCents: 200,
          totalCents: 2900,
        },
        payments: [{ prepaid: true, providerStatus: "PAID", amountCents: 2900 }],
        providerMetadata: {
          expectedMerchantAmountCents: 2300,
          commissionCents: 400,
          logisticsCostCents: 200,
          customerDocument: "123.456.789-00",
        },
      },
    });

    expect(projected).toMatchObject({
      provider: "ifood",
      paymentOwner: "provider",
      totalCents: 2900,
      expectedMerchantAmountCents: 2300,
      commissionCents: 400,
      logisticsCostCents: 200,
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("Cliente Secreto");
    expect(serialized).not.toContain("11999999999");
    expect(serialized).not.toContain("Rua Privada");
    expect(serialized).not.toContain("123.456.789-00");
  });

  it("does not invent commission or settlement when the provider omitted them", () => {
    const order = projectExternalFinance({
      order_id: "order-2",
      provider: "99food",
      payment_owner: "merchant",
      last_snapshot: {
        money: {
          subtotalCents: 4000,
          deliveryFeeCents: 0,
          discountCents: 0,
          additionalFeeCents: 0,
          totalCents: 4000,
        },
        payments: [{ prepaid: false, providerStatus: "PENDING", amountCents: 4000 }],
        providerMetadata: {},
      },
    });
    expect(order?.commissionCents).toBeNull();
    expect(order?.expectedMerchantAmountCents).toBeNull();
    expect(order?.logisticsCostCents).toBeNull();
  });

  it("separates provider-owned and merchant-owned totals without double counting", () => {
    const providerOrder = projectExternalFinance({
      order_id: "a",
      provider: "ifood",
      payment_owner: "provider",
      last_snapshot: {
        money: { subtotalCents: 1000, deliveryFeeCents: 0, discountCents: 0, additionalFeeCents: 0, totalCents: 1000 },
        payments: [{ prepaid: true, amountCents: 1000 }],
      },
    })!;
    const merchantOrder = projectExternalFinance({
      order_id: "b",
      provider: "ifood",
      payment_owner: "merchant",
      last_snapshot: {
        money: { subtotalCents: 2000, deliveryFeeCents: 0, discountCents: 0, additionalFeeCents: 0, totalCents: 2000 },
        payments: [{ prepaid: false, amountCents: 2000 }],
      },
    })!;
    expect(summarizeExternalChannels([providerOrder, merchantOrder])).toEqual([expect.objectContaining({
      provider: "ifood",
      orderCount: 2,
      totalCents: 3000,
      providerOwnedCents: 1000,
      merchantOwnedCents: 2000,
    })]);
  });

  it("keeps external import free of CRM/WhatsApp marketing side effects", () => {
    const inbox = source("src/server/integrations/runtime/external-order-inbox-handler.ts");
    expect(inbox).not.toContain("scheduleOrderWhatsAppNotifications");
    expect(inbox).not.toContain("scheduleConversation");
    expect(inbox).not.toContain("marketing");
  });

  it("does not translate operational provider cancellation into an internal refund", () => {
    const lifecycle = source("src/server/integrations/providers/ifood/ifood-order-lifecycle-reconciler.ts");
    expect(lifecycle).not.toContain("payment_refund_internal");
    expect(lifecycle).not.toContain("PaymentService.refund");
    expect(lifecycle).not.toContain("payment_confirm_internal");
  });

  it("documents retention and external financial authority", () => {
    const policy = source("docs/EXTERNAL_ORDER_FINANCE_PRIVACY.md");
    expect(policy).toContain("não dispara automaticamente `payment_refund_internal`");
    expect(policy).toContain("não significa consentimento para marketing");
    expect(policy).toContain("projeções sanitizadas e agregadas");
  });
});
