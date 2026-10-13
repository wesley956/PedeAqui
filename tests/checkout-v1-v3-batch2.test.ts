import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

// Checkout Expresso: página do servidor + formulário único + ação que salva cada parte com as mesmas regras.
const page = read("src/app/m/[slug]/checkout/page.tsx") + read("src/features/checkout/express-checkout-form.tsx");
const actions = read("src/features/checkout/actions.ts") + read("src/features/checkout/express-actions.ts");
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
    expect(page).toContain("formAction={action}");
    expect(actions).toContain("await applyCheckoutBenefitsAction(formData)");
    expect(actions).toContain("await clearCheckoutBenefitsAction(formData)");
    expect(page).toContain("cart.discount_cents");
    expect(page).toContain("cart.total_cents");
  });

  it("exposes existing scheduling without introducing a mandatory stage", () => {
    expect(page).toContain('<input type="hidden" name="when" value={when} />');
    expect(page).toContain("<strong>Agora</strong>");
    expect(page).toContain("<strong>Agendar</strong>");
    expect(page).toContain('name="localDateTime" type="datetime-local"');
    expect(page).not.toContain("| \"schedule\"");
    expect(actions).toContain("CheckoutService.saveSchedule");
    expect(checkoutService).toContain("assertScheduledWindow");
    expect(checkoutService).toContain("zonedLocalDateTimeToUtc");
  });

  it("keeps every block editable on one screen and sourced from official cart/session values", () => {
    expect(page).toContain("Como receber");
    expect(page).toContain("Seus dados");
    expect(page).toContain("Endereço");
    expect(page).toContain("Pagamento");
    expect(page).toContain("Resumo");
    expect(page).not.toContain("?etapa=");
    expect(page).toContain("cart.subtotal_cents");
    expect(page).toContain("cart.delivery_fee_cents");
    expect(page).toContain("cart.total_cents");
  });

  it("preserves the safe confirmation chain and post-order side effects", () => {
    expect(actions).toContain("await confirmCheckoutOrderAction(formData)");
    expect(page).toContain("action={submitExpressCheckoutAction}");
    expect(confirmAction).toContain("assertStoreOperationalAccess");
    expect(confirmAction).toContain("createOrderFromCheckoutAction(formData)");
    expect(orderActions).toContain("OrderService.createFromCheckout");
    expect(orderService).toContain("findExistingByCartToken");
    expect(orderService).toContain("CheckoutService.review");
    expect(orderService).toContain("create_order_from_checkout_internal");
    expect(orderActions).toContain("OrderNotificationContextService.capture");
    expect(orderActions).toContain('scheduleOrderWhatsAppNotifications("checkout.order_created", result.order_id)');
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
    expect(page).toContain("total_updated");
    expect(page).toContain("Não foi possível continuar. Confira os dados e tente novamente.");
  });
});
