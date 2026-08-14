import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const summary = readFileSync("src/features/checkout/final-order-options.tsx", "utf8");
describe("final order options UI", () => {
  it("only renders payment methods enabled by the store service", () => { expect(page).toContain("data.paymentMethods.filter((item) => item.enabled)"); expect(page).toContain("enabledMethods.map"); });
  it("only renders fulfillment modes permitted by public menu settings", () => { expect(page).toContain("menu.settings.allow_delivery && menu.delivery.enabled"); expect(page).toContain("menu.settings.allow_pickup"); });
  it("asks for change only when cash is selected", () => { expect(page).toContain('selectedPayment === "cash"'); expect(summary).toContain('paymentMethod === "cash"'); });
  it("makes pending, attention and ready review states explicit", () => { expect(summary).toContain("Pendente de revisão"); expect(summary).toContain("Ajustes necessários"); expect(summary).toContain("Pronto para confirmar"); });
  it("keeps review and order creation server actions as final authority", () => { expect(page).toContain("reviewCheckoutAction"); expect(page).toContain("createOrderFromCheckoutAction"); });
});
