import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("src/app/m/[slug]/checkout/page.tsx");
const css = read("src/app/m/[slug]/checkout/checkout.module.css");
const actions = read("src/features/checkout/actions.ts");
const checkoutService = read("src/server/checkout/checkout-service.ts");
const orderService = read("src/server/orders/order-service.ts");
const orderActions = read("src/features/orders/actions.ts");

describe("checkout V1+V3 baseline", () => {
  it("keeps the server checkout as the source of truth", () => {
    expect(page).toContain("CheckoutService.load(slug, token, recognitionToken)");
    expect(checkoutService).toContain('from("checkout_sessions")');
    expect(actions).toContain("saveCheckoutFulfillmentAction");
    expect(actions).toContain("saveCheckoutIdentityAction");
    expect(actions).toContain("saveCheckoutAddressAction");
    expect(actions).toContain("saveCheckoutPaymentAction");
  });

  it("keeps delivery and pickup as different stage sequences", () => {
    expect(page).toContain('["fulfillment", "identity", "address", "payment", "review"]');
    expect(page).toContain('["fulfillment", "identity", "payment", "review"]');
    expect(page).toContain('session?.fulfillment_type === "delivery"');
    expect(page).toContain("menu.settings.allow_delivery && menu.delivery.enabled");
    expect(page).toContain("menu.settings.allow_pickup");
  });

  it("keeps recognition gated before saved addresses are exposed", () => {
    expect(page).toContain("recognizedForSession && recognizedCustomer && recognizedCustomer.addresses.length > 0");
    expect(checkoutService).toContain("recognized.customerId !== session.customer_id");
    expect(page).toContain("useSavedCheckoutAddressAction");
  });

  it("keeps delivery quote state and optional postal code", () => {
    expect(page).toContain('session?.delivery_quote_status === "valid"');
    expect(page).toContain('session?.delivery_quote_status === "unserviceable"');
    expect(page).toContain('label="CEP (opcional)"');
    expect(checkoutService).toContain("DeliveryQuoteService.quote");
  });

  it("keeps payment and optional growth resources server-driven", () => {
    expect(page).toContain("data.paymentMethods.filter((item) => item.enabled)");
    expect(page).toContain("growthEnabled && benefits");
    expect(page).toContain("cash_change_for_cents");
    expect(page).toContain("pix_email_required");
  });

  it("keeps final review, idempotency and post-order effects", () => {
    expect(orderService).toContain("CheckoutService.review(storeSlug, token)");
    expect(orderService).toContain("findExistingByCartToken");
    expect(orderActions).toContain("scheduleOrderWhatsAppNotifications(\"checkout.order_created\")");
    expect(orderActions).toContain("scheduleOrderPixCharge(result.order_id)");
    expect(orderActions).toContain("CustomerRecognitionService.issueFromOrder");
  });

  it("uses a dynamic fullscreen shell without blocking emergency overflow", () => {
    expect(css).toContain("height:100dvh");
    expect(css).toContain("overflow-y:auto");
    expect(page).toContain("stageViewport");
    expect(page).toContain("activeStage");
  });
});
