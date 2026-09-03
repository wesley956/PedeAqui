import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reviewCheckout } from "@/server/checkout/review";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const sql = fs.readdirSync(path.join(root, "supabase/sql"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => fs.readFileSync(path.join(root, "supabase/sql", name), "utf8"))
  .join("\n");

const validBase = {
  cartItemStatuses: ["valid"] as const,
  subtotalCents: 5000,
  totalCents: 5800,
  minimumOrderCents: 2000,
  canOrder: true,
  identityComplete: true,
  fulfillmentType: "delivery" as const,
  deliveryQuoteStatus: "valid" as const,
  paymentMethod: "cash" as const,
  enabledPaymentMethods: ["cash", "credit_card", "debit_card"] as const,
  cashChangeForCents: null,
  scheduledFor: null,
};

describe("stabilization #829 commercial journey", () => {
  it("keeps the public journey connected from menu to secure tracking and operational history", () => {
    expect(read("src/app/m/[slug]/page.tsx")).toContain("MenuBrowser");
    expect(read("src/app/m/[slug]/produto/[id]/page.tsx")).toContain("addToCartAction");
    expect(read("src/app/m/[slug]/carrinho/page.tsx")).toContain("/checkout");
    expect(read("src/app/m/[slug]/checkout/page.tsx")).toContain("confirmCheckoutOrderAction");
    expect(read("src/features/checkout/confirm-order-action.ts")).toContain("createOrderFromCheckoutAction");
    expect(read("src/app/m/[slug]/pedido/[id]/page.tsx")).toContain("PublicOrderService");
    expect(read("src/server/orders/order-service.ts")).toContain("listHistory");
  });

  it("revalidates checkout and total on the server and replays the same converted cart", () => {
    const orderService = read("src/server/orders/order-service.ts");
    expect(orderService.indexOf("findExistingByCartToken")).toBeLessThan(orderService.indexOf("CheckoutService.review"));
    expect(orderService).toContain('admin.rpc("create_order_from_checkout_internal"');
    expect(sql).toContain("create_order_from_checkout_internal");
    expect(sql).toContain("v_total:=greatest(0,v_cart.subtotal_cents-v_discount+v_cart.delivery_fee_cents)");
    expect(sql).toContain("benefits changed; review checkout again");
    expect(sql).toContain("where source_cart_id=v_cart.id");
    expect(sql).toContain("'created',false");
  });

  it("keeps modifier quantities and every configured option in cart-to-order snapshots", () => {
    expect(sql).toContain("unit_price_cents,quantity");
    expect(sql).toContain("m.unit_price_cents,m.quantity");
    expect(sql).toContain("from public.cart_item_modifiers m where m.cart_item_id=v_cart_item.id");
    expect(sql).toContain("insert into public.order_item_gas_options");
    const modifierTest = read("tests/modifier-quantity-contract.test.ts");
    expect(modifierTest).toContain("+ 5x Coxinha");
    expect(modifierTest).toContain("+ 2x Kibe");
  });

  it("supports delivery/pickup and only accepts payment methods currently enabled", () => {
    expect(reviewCheckout({ ...validBase, enabledPaymentMethods: [...validBase.enabledPaymentMethods] }).ready).toBe(true);
    expect(reviewCheckout({
      ...validBase,
      fulfillmentType: "pickup",
      deliveryQuoteStatus: "not_required",
      paymentMethod: "credit_card",
      enabledPaymentMethods: ["credit_card"],
    }).ready).toBe(true);
    expect(reviewCheckout({
      ...validBase,
      fulfillmentType: "pickup",
      deliveryQuoteStatus: "not_required",
      paymentMethod: "debit_card",
      enabledPaymentMethods: ["debit_card"],
    }).ready).toBe(true);
    expect(reviewCheckout({ ...validBase, paymentMethod: "pix", enabledPaymentMethods: ["cash"] }).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "payment_unavailable" })]));
    expect(reviewCheckout({ ...validBase, paymentMethod: "pix", enabledPaymentMethods: ["pix"] }).ready).toBe(true);
  });

  it("blocks closed store, unavailable item and unserviceable delivery before order creation", () => {
    expect(reviewCheckout({ ...validBase, canOrder: false, enabledPaymentMethods: [...validBase.enabledPaymentMethods] }).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "store_unavailable" })]));
    expect(reviewCheckout({ ...validBase, cartItemStatuses: ["unavailable"], enabledPaymentMethods: [...validBase.enabledPaymentMethods] }).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "empty_or_invalid_cart" })]));
    expect(reviewCheckout({ ...validBase, deliveryQuoteStatus: "unserviceable", enabledPaymentMethods: [...validBase.enabledPaymentMethods] }).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "delivery_not_ready" })]));
  });

  it("supports recognized customers with multiple saved addresses without trusting an arbitrary address", () => {
    const checkout = read("src/server/checkout/checkout-service.ts");
    expect(checkout).toContain("CustomerRecognitionService.resolve");
    expect(checkout).toContain("recognized.addresses[addressIndex]");
    expect(checkout).toContain("recognized.customerId !== session.customer_id");
    expect(checkout).toContain("return this.saveAddress(storeSlug, token");
  });

  it("creates the core order before optional customer/WhatsApp/PIX side effects", () => {
    const actions = read("src/features/orders/actions.ts");
    const create = actions.indexOf("OrderService.createFromCheckout(storeSlug, token)");
    const notificationContext = actions.indexOf("OrderNotificationContextService.capture", create);
    const whatsapp = actions.indexOf('scheduleOrderWhatsAppNotifications("checkout.order_created")', create);
    const pix = actions.indexOf("scheduleOrderPixCharge", create);
    const recognition = actions.indexOf("CustomerRecognitionService.issueFromOrder", create);
    expect(create).toBeGreaterThan(-1);
    expect(notificationContext).toBeGreaterThan(create);
    expect(whatsapp).toBeGreaterThan(create);
    expect(pix).toBeGreaterThan(create);
    expect(recognition).toBeGreaterThan(create);
    expect(actions).toContain("customer_recognition_issue_failed");
  });

  it("keeps mobile and desktop regression gates in the same CI suite", () => {
    expect(read("tests/mobile-full-layout-qa.test.ts")).toBeTruthy();
    expect(read("tests/tablet-layout-qa.test.ts")).toBeTruthy();
    expect(read("tests/desktop-visual-qa.test.ts")).toBeTruthy();
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("E2E context journeys — 3 consecutive passes");
  });
});
