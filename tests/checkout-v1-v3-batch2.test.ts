import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("src/app/m/[slug]/checkout/page.tsx");
const actions = read("src/features/checkout/actions.ts");
const confirmAction = read("src/features/checkout/confirm-order-action.ts");
const orderActions = read("src/features/orders/actions.ts");
const checkoutService = read("src/server/checkout/checkout-service.ts");
const orderService = read("src/server/orders/order-service.ts");

describe("checkout V1+V3 batch 2", () => {
  it("renders only server-enabled payment methods and preserves cash/Pix contracts", () => {
    expect(page).toContain("data.paymentMethods.filter((item) => item.enabled)");
    expect(page).toContain("PaymentMethodFields");
    expect(page).toContain("cash_change_for_cents");
    expect(page).toContain("pix_email_required");
    expect(actions).toContain("method === \"cash\"");
    expect(actions).toContain("CheckoutService.savePayment");
    expect(checkoutService).toContain("payment_unavailable");
    expect(checkoutService).toContain("invalid_change");
  });

  it("keeps Growth optional and calculated on the server", () => {
    expect(page).toContain("growthEnabled && benefits");
    expect(page).toContain("applyCheckoutBenefitsAction");
    expect(page).toContain("clearCheckoutBenefitsAction");
    expect(page).toContain("cart.discount_cents");
    expect(page).toContain("cart.total_cents");
  });

  it("exposes existing scheduling without introducing a mandatory stage", () => {
    expect(page).toContain("saveCheckoutScheduleAction");
    expect(page).toContain("Quero agendar este pedido");
    expect(page).toContain("name=\"mode\" value=\"asap\"");
    expect(page).toContain("name=\"mode\" value=\"scheduled\"");
    expect(page).not.toContain("| \"schedule\"");
    expect(actions).toContain("CheckoutService.saveSchedule");
    expect(checkoutService).toContain("assertScheduledWindow");
    expect(checkoutService).toContain("zonedLocalDateTimeToUtc");
  });

  it("keeps the final review editable and sourced from official cart/session values", () => {
    expect(page).toContain("Alterar recebimento");
    expect(page).toContain("Alterar dados");
    expect(page).toContain("Alterar endereço");
    expect(page).toContain("Alterar pagamento");
    expect(page).toContain("FinalOrderOptions");
    expect(page).toContain("cart.subtotal_cents");
    expect(page).toContain("cart.delivery_fee_cents");
    expect(page).toContain("cart.total_cents");
  });

  it("preserves the safe confirmation chain and post-order side effects", () => {
    expect(page).toContain("confirmCheckoutOrderAction");
    expect(confirmAction).toContain("assertStoreOperationalAccess");
    expect(confirmAction).toContain("createOrderFromCheckoutAction(formData)");
    expect(orderActions).toContain("OrderService.createFromCheckout");
    expect(orderService).toContain("findExistingByCartToken");
    expect(orderService).toContain("CheckoutService.review");
    expect(orderService).toContain("create_order_from_checkout_internal");
    expect(orderActions).toContain("OrderNotificationContextService.capture");
    expect(orderActions).toContain("scheduleOrderWhatsAppNotifications(\"checkout.order_created\")");
    expect(orderActions).toContain("scheduleOrderPixCharge(result.order_id)");
    expect(orderActions).toContain("CustomerRecognitionService.issueFromOrder");
    expect(orderActions).toContain("orderCookieName");
    expect(orderActions).toContain("redirect(`/m/${storeSlug}/pedido/${result.order_id}`)");
  });

  it("maps known checkout errors back to the correct server-driven stage", () => {
    for (const code of [
      "invalid_fulfillment", "pickup_disabled", "delivery_disabled",
      "invalid_phone", "invalid_identity", "pix_email_required",
      "invalid_address", "delivery_not_selected", "delivery_minimum", "neighborhood_not_served",
      "saved_address_invalid", "recognition_required", "identity_required",
      "invalid_payment", "payment_unavailable", "invalid_change",
      "invalid_schedule", "checkout_not_ready", "benefit_invalid", "benefit_unavailable",
    ]) expect(page).toContain(code);
    expect(page).toContain("aria-live=\"assertive\"");
    expect(page).toContain("data-error-stage={activeStage}");
    expect(page).toContain("Não foi possível continuar. Confira os dados e tente novamente.");
  });
});
