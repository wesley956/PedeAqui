import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const actions = readFileSync("src/features/checkout/actions.ts", "utf8");
const service = readFileSync("src/server/checkout/checkout-service.ts", "utf8");
const cash = readFileSync("src/features/checkout/cash-change-fields.tsx", "utf8");

describe("refined public checkout", () => {
  it("starts with fulfillment and removes delivery address from pickup", () => {
    expect(page).toContain('<Step number="1" title="Como vai receber?"');
    expect(page).toContain("fulfillmentComplete && deliverySelected");
    expect(page).toContain('value="delivery"');
    expect(page).toContain('value="pickup"');
  });

  it("keeps recognition privacy before exposing saved addresses", () => {
    expect(page).toContain("recognizedForSession && recognizedCustomer");
    expect(page).toContain("Por segurança, os endereços não são exibidos antes dessa confirmação");
    expect(service).toContain("recognized.customerId !== session.customer_id");
    expect(service).toContain("identity_required");
  });

  it("keeps email secondary but reopens identity when Pix requires it", () => {
    expect(page).toContain("styles.inlineOptional");
    expect(page).toContain('query.erro === "pix_email_required"');
    expect(service).toContain('values.method === "pix" && !session?.customer_email');
    expect(service).toContain("pix_email_required");
  });

  it("asks about cash change before revealing the amount", () => {
    expect(page).toContain("<CashChangeFields");
    expect(cash).toContain("Precisa de troco?");
    expect(cash).toContain("Troco para quanto?");
    expect(cash).toContain("needsChange ?");
    expect(actions).toContain('method === "cash" && rawChange');
  });

  it("preserves scheduling, benefits, review and server-side order creation", () => {
    expect(page).toContain("saveCheckoutScheduleAction");
    expect(page).toContain("applyCheckoutBenefitsAction");
    expect(page).toContain("reviewCheckoutAction");
    expect(page).toContain("createOrderFromCheckoutAction");
    expect(page).toContain("CheckoutReviewState");
    expect(page).toContain("FinalOrderOptions");
  });

  it("never moves delivery quotes, payment eligibility or review authority into the browser", () => {
    expect(service).toContain("DeliveryQuoteService.quote");
    expect(service).toContain("StorePaymentMethodService.listForStore");
    expect(service).toContain("reviewCheckout");
    expect(page).not.toContain("localStorage");
  });
});
