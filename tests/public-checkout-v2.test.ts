import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Keep these assertions at the component/service boundary that owns each behavior.
const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const actions = readFileSync("src/features/checkout/actions.ts", "utf8");
const benefitActions = readFileSync("src/features/checkout/benefit-actions.ts", "utf8");
const confirmAction = readFileSync("src/features/checkout/confirm-order-action.ts", "utf8");
const service = readFileSync("src/server/checkout/checkout-service.ts", "utf8");
const orderService = readFileSync("src/server/orders/order-service.ts", "utf8");
const cash = readFileSync("src/features/checkout/cash-change-fields.tsx", "utf8");
const paymentFields = readFileSync("src/features/checkout/payment-method-fields.tsx", "utf8");

describe("refined public checkout", () => {
  it("starts with fulfillment, then identity, and removes delivery address from pickup", () => {
    expect(page).toContain('<Step number="1" title="Como vai receber?"');
    expect(page.indexOf('title="Seus dados"')).toBeLessThan(page.indexOf('title="Onde entregar?"'));
    expect(page).toContain("fulfillmentComplete && identityComplete && deliverySelected");
    expect(page).toContain('value="delivery"');
    expect(page).toContain('value="pickup"');
  });

  it("keeps recognition privacy before exposing saved addresses", () => {
    expect(page).toContain("recognizedForSession && recognizedCustomer");
    expect(page).toContain("Por segurança, confirme o endereço novamente para este WhatsApp");
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
    expect(paymentFields).toContain("<CashChangeFields");
    expect(paymentFields).toContain('method === "cash"');
    expect(cash).toContain("Precisa de troco?");
    expect(cash).toContain("Troco para quanto?");
    expect(cash).toContain("needsChange ?");
    expect(actions).toContain('method === "cash" && rawChange');
  });

  it("preserves scheduling and module-gates benefits", () => {
    expect(actions).toContain("saveCheckoutScheduleAction");
    expect(service).toContain("static async saveSchedule");
    expect(page).toContain("paymentComplete && growthEnabled && benefits");
    expect(page).toContain("applyCheckoutBenefitsAction");
    expect(benefitActions).toContain("StoreModuleStateService.isEnabled");
  });

  it("uses one customer-facing confirmation with server-side review before creation", () => {
    expect(page).toContain("confirmCheckoutOrderAction");
    expect(page).not.toContain("reviewCheckoutAction");
    expect(page).not.toContain("CheckoutReviewState");
    expect(page).toContain("FinalOrderOptions");
    expect(confirmAction).toContain("createOrderFromCheckoutAction");
    expect(orderService).toContain("CheckoutService.review(storeSlug, token)");
  });

  it("never moves delivery quotes, payment eligibility or review authority into the browser", () => {
    expect(service).toContain("DeliveryQuoteService.quote");
    expect(service).toContain("StorePaymentMethodService.listForStore");
    expect(service).toContain("reviewCheckout");
    expect(page).not.toContain("localStorage");
  });
});
