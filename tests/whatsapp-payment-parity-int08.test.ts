import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWhatsAppPaymentPrompt,
  enabledWhatsAppPaymentOptions,
  resolveWhatsAppPaymentSelection,
  type WhatsAppPaymentOption,
} from "@/server/conversations/whatsapp-payment-methods";

const customId = "11111111-1111-4111-8111-111111111111";

function canonicalOptions(overrides: { pixEnabled?: boolean; debitEnabled?: boolean } = {}): WhatsAppPaymentOption[] {
  return [
    { method: "pix", enabled: overrides.pixEnabled ?? true, sortOrder: 10 },
    { method: "credit_card", enabled: true, sortOrder: 20 },
    { method: "debit_card", enabled: overrides.debitEnabled ?? true, sortOrder: 30 },
    { method: "cash", enabled: true, sortOrder: 40 },
    { method: "custom", enabled: true, sortOrder: 100, customPaymentMethodId: customId, label: "Ticket" },
    { method: "custom", enabled: false, sortOrder: 110, customPaymentMethodId: "22222222-2222-4222-8222-222222222222", label: "Convênio antigo" },
  ];
}

describe("INT-08 WhatsApp payment parity", () => {
  it("renders every enabled canonical checkout method in canonical order, including Pix and Ticket", () => {
    const prompt = buildWhatsAppPaymentPrompt(canonicalOptions());
    expect(prompt).toBe(
      "Como será o pagamento?\n"
      + "1 — Pix\n"
      + "2 — Cartão de crédito\n"
      + "3 — Cartão de débito\n"
      + "4 — Dinheiro\n"
      + "5 — Ticket",
    );
    expect(prompt).not.toContain("Convênio antigo");
  });

  it("inherits Pix readiness from the canonical list instead of assuming Pix is available", () => {
    const options = canonicalOptions({ pixEnabled: false });
    expect(enabledWhatsAppPaymentOptions(options).map((item) => item.method)).toEqual([
      "credit_card",
      "debit_card",
      "cash",
      "custom",
    ]);
    expect(buildWhatsAppPaymentPrompt(options)).not.toContain("Pix");
    expect(resolveWhatsAppPaymentSelection("pix", options)).toBeNull();
  });

  it("resolves standard methods by the dynamic number or their natural name", () => {
    const options = canonicalOptions();
    expect(resolveWhatsAppPaymentSelection("1", options)).toEqual({
      method: "pix",
      customPaymentMethodId: null,
      label: "Pix",
    });
    expect(resolveWhatsAppPaymentSelection("dinheiro", options)).toEqual({
      method: "cash",
      customPaymentMethodId: null,
      label: "Dinheiro",
    });
    expect(resolveWhatsAppPaymentSelection("cartão de crédito", options)).toEqual({
      method: "credit_card",
      customPaymentMethodId: null,
      label: "Cartão de crédito",
    });
  });

  it("resolves a custom Ticket by number or name and preserves its canonical ID", () => {
    const options = canonicalOptions();
    const expected = { method: "custom", customPaymentMethodId: customId, label: "Ticket" };
    expect(resolveWhatsAppPaymentSelection("5", options)).toEqual(expected);
    expect(resolveWhatsAppPaymentSelection("ticket", options)).toEqual(expected);
  });

  it("renumbers after a disabled method instead of keeping a parallel fixed 1/2/3 registry", () => {
    const options = canonicalOptions({ pixEnabled: false, debitEnabled: false });
    const prompt = buildWhatsAppPaymentPrompt(options);
    expect(prompt).toContain("1 — Cartão de crédito");
    expect(prompt).toContain("2 — Dinheiro");
    expect(prompt).toContain("3 — Ticket");
    expect(resolveWhatsAppPaymentSelection("3", options)).toEqual({
      method: "custom",
      customPaymentMethodId: customId,
      label: "Ticket",
    });
  });

  it("fails closed when no canonical payment method is enabled", () => {
    const options = canonicalOptions().map((option) => ({ ...option, enabled: false }));
    expect(buildWhatsAppPaymentPrompt(options)).toContain("Não há uma forma de pagamento disponível");
    expect(resolveWhatsAppPaymentSelection("1", options)).toBeNull();
    expect(resolveWhatsAppPaymentSelection("pix", options)).toBeNull();
  });

  it("locks the runtime to StorePaymentMethodService and the checkout write path", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/conversations/whatsapp-order-service.ts"), "utf8");

    expect(source).toContain("StorePaymentMethodService.listForStore(organizationId, storeId)");
    expect(source).toContain("resolveWhatsAppPaymentSelection(input.text, options)");
    expect(source).toContain("customPaymentMethodId: selected.customPaymentMethodId");
    expect(source).toContain('error.code === "pix_email_required"');
    expect(source).toContain("CheckoutService.saveIdentity");
    expect(source).toContain("CheckoutService.savePayment");

    expect(source).not.toContain('.from("store_payment_methods")');
    expect(source).not.toContain('.in("method", ["cash", "credit_card", "debit_card"])');
    expect(source).not.toContain("PaymentService.confirm");
    expect(source).not.toContain("OrderPixService.ensureForOrder");
    expect(source).not.toContain("OrderPixService.reconcile");
    expect(source).not.toContain("payment_status:");
  });
});
