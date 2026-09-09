import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("src/app/m/[slug]/checkout/page.tsx");
const css = read("src/app/m/[slug]/checkout/checkout.module.css");
const checkoutService = read("src/server/checkout/checkout-service.ts");
const orderAction = read("src/features/orders/actions.ts");

describe("[980] persistent shell and navigation contracts", () => {
  it("keeps adaptive 5-step delivery and 4-step pickup flows", () => {
    expect(page).toContain('["fulfillment", "identity", "address", "payment", "review"]');
    expect(page).toContain('["fulfillment", "identity", "payment", "review"]');
    expect(page).toContain("stageOrder.indexOf(activeStage)");
    expect(page).toContain("totalSteps = stageOrder.length");
  });

  it("keeps contextual back navigation without client-side state authority", () => {
    expect(page).toContain('activeStage === "fulfillment"');
    expect(page).toContain('stageHref(slug, "fulfillment")');
    expect(page).toContain('stageHref(slug, "identity")');
    expect(page).toContain('stageHref(slug, "address")');
    expect(page).toContain('stageHref(slug, "payment")');
    expect(page).toContain("CheckoutService.load");
  });

  it("renders totals from official cart state", () => {
    expect(page).toContain("cart.total_cents");
    expect(page).toContain("cart.subtotal_cents");
    expect(page).toContain("cart.delivery_fee_cents");
    expect(page).toContain("cart.discount_cents");
  });
});

describe("[981] responsive and accessibility contracts", () => {
  it("uses dynamic viewport, safe areas and internal overflow fallback", () => {
    expect(css).toContain("height:100dvh");
    expect(css).toContain("safe-area-inset-top");
    expect(css).toContain("safe-area-inset-bottom");
    expect(css).toContain("overflow-y:auto");
    expect(css).toContain("overflow-x:hidden");
  });

  it("protects small screens and reduced motion", () => {
    expect(css).toContain("@media(max-width:360px)");
    expect(css).toContain("@media(max-height:620px)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });

  it("keeps visible keyboard focus on interactive controls", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline-offset:3px");
    expect(page).toContain('role="alert"');
    expect(page).toContain('aria-live="assertive"');
  });
});

describe("[982] final functional gate contracts", () => {
  it("preserves payment, growth and scheduling server actions", () => {
    expect(page).toContain("saveCheckoutPaymentAction");
    expect(page).toContain("applyCheckoutBenefitsAction");
    expect(page).toContain("clearCheckoutBenefitsAction");
    expect(page).toContain("saveCheckoutScheduleAction");
    expect(page).toContain("confirmCheckoutOrderAction");
  });

  it("keeps delivery quote and server review authoritative", () => {
    expect(checkoutService).toContain("DeliveryQuoteService.quote");
    expect(checkoutService).toContain("async review(");
    expect(orderAction).toContain("OrderService.createFromCheckout");
  });

  it("keeps post-order recognition, Pix and notification hooks", () => {
    expect(orderAction).toContain("CustomerRecognitionService.issueFromOrder");
    expect(orderAction).toContain("scheduleOrderPixCharge");
    expect(orderAction).toContain("scheduleOrderWhatsAppNotifications");
    expect(orderAction).toContain("cartCookieName");
  });
});
