import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExternalPaymentPolicy } from "@/server/payments/external-payment-policy";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("omnichannel external payment policy", () => {
  it("keeps native orders fully internal", () => {
    expect(resolveExternalPaymentPolicy(null)).toEqual({
      external: false,
      owner: null,
      provider: null,
      allowsInternalMutation: true,
      allowsOnlinePix: true,
    });
  });

  it("makes provider-owned marketplace money externally authoritative", () => {
    const policy = resolveExternalPaymentPolicy({ provider: "ifood", payment_owner: "provider" });
    expect(policy.external).toBe(true);
    expect(policy.owner).toBe("provider");
    expect(policy.allowsInternalMutation).toBe(false);
    expect(policy.allowsOnlinePix).toBe(false);
  });

  it("allows merchant collection but never auto-starts PedeAqui online Pix for marketplace orders", () => {
    const policy = resolveExternalPaymentPolicy({ provider: "99food", payment_owner: "merchant" });
    expect(policy.allowsInternalMutation).toBe(true);
    expect(policy.allowsOnlinePix).toBe(false);
  });

  it("guards OrderPixService before Mercado Pago readiness or charge reservation", () => {
    const pix = source("src/server/payments/order-pix-service.ts");
    const ownership = pix.indexOf('const { data: externalPayment, error: externalPaymentError } = await admin.from("external_orders")');
    const ready = pix.indexOf("const ready = await OrderPaymentProviderConfigService.isOnlinePixReady");
    const reserve = pix.indexOf('const { data: reserved, error: reserveError } = await admin.rpc("order_payment_provider_reserve_charge_internal"');
    expect(ownership).toBeGreaterThan(-1);
    expect(ownership).toBeLessThan(ready);
    expect(ownership).toBeLessThan(reserve);
    expect(pix).toContain("allowsOnlinePix");
  });

  it("guards manual create, confirm, fail and refund mutations", () => {
    const payments = source("src/server/payments/payment-service.ts");
    expect(payments).toContain("assertInternalPaymentMutation");
    expect(payments.match(/assertInternalPaymentMutation\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(payments).toContain("payment_owner");
    expect(payments).toContain("não pode ser alterado manualmente");
  });

  it("removes provider-owned delivered orders from the local collection queue", () => {
    const finance = source("src/server/finance/finance-read-service.ts");
    expect(finance).toContain('from("external_orders")');
    expect(finance).toContain("resolveExternalPaymentPolicy");
    expect(finance).toContain("allowsInternalMutation");
    expect(finance).toContain("external_payment");
  });
});
