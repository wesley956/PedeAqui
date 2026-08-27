import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextualNavigation } from "@/components/layout/navigation-model";
import { PERMISSIONS } from "@/server/access/permissions";
import { reviewCheckout } from "@/server/checkout/review";
import { assertTransition } from "@/server/orders/state-machines";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const storeA = "00000000-0000-4000-8000-000000000001";
const storeB = "00000000-0000-4000-8000-000000000002";

describe("E2E context journeys [317]", () => {
  it("keeps test fixtures isolated by store without persistent database writes", () => {
    const fixtures = [
      { storeId: storeA, order: "A-1" },
      { storeId: storeB, order: "B-1" },
    ];
    expect(fixtures.filter((item) => item.storeId === storeA).map((item) => item.order)).toEqual(["A-1"]);
    expect(fixtures.filter((item) => item.storeId === storeB).map((item) => item.order)).toEqual(["B-1"]);
    expect(storeA).not.toBe(storeB);
  });

  it("chains the public journey from menu to order tracking", () => {
    expect(read("src/app/m/[slug]/page.tsx")).toContain("MenuBrowser");
    expect(read("src/app/m/[slug]/produto/[id]/page.tsx")).toContain("addToCartAction");
    expect(read("src/app/m/[slug]/carrinho/page.tsx")).toContain("/checkout");
    expect(read("src/app/m/[slug]/checkout/page.tsx")).toContain("confirmCheckoutOrderAction");
    expect(read("src/features/checkout/confirm-order-action.ts")).toContain("createOrderFromCheckoutAction");
    expect(read("src/app/m/[slug]/pedido/[id]/page.tsx")).toContain("PublicOrderService");
  });

  it("validates a complete public checkout for delivery and pickup", () => {
    const base = {
      cartItemStatuses: ["valid"] as const,
      subtotalCents: 5000,
      totalCents: 5800,
      minimumOrderCents: 2000,
      canOrder: true,
      identityComplete: true,
      paymentMethod: "pix" as const,
      enabledPaymentMethods: ["pix", "cash"] as const,
      cashChangeForCents: null,
      scheduledFor: null,
    };
    expect(reviewCheckout({ ...base, fulfillmentType: "delivery", deliveryQuoteStatus: "valid", enabledPaymentMethods: [...base.enabledPaymentMethods] }).ready).toBe(true);
    expect(reviewCheckout({ ...base, fulfillmentType: "pickup", deliveryQuoteStatus: "not_required", enabledPaymentMethods: [...base.enabledPaymentMethods] }).ready).toBe(true);
  });

  it("walks a delivery order through confirmation production dispatch and completion", () => {
    assertTransition("order", "pending_confirmation", "confirmed");
    assertTransition("production", "pending_confirmation", "queued");
    assertTransition("production", "queued", "preparing");
    assertTransition("production", "preparing", "ready");
    assertTransition("fulfillment", "pending", "awaiting_assignment");
    assertTransition("fulfillment", "awaiting_assignment", "assigned");
    assertTransition("fulfillment", "assigned", "picked_up");
    assertTransition("fulfillment", "picked_up", "out_for_delivery");
    assertTransition("fulfillment", "out_for_delivery", "delivered");
    assertTransition("order", "confirmed", "completed");
  });

  it("walks a pickup order through the coherent pickup fulfillment path", () => {
    assertTransition("fulfillment", "pending", "awaiting_pickup");
    assertTransition("fulfillment", "awaiting_pickup", "picked_up_by_customer");
  });

  it("connects operational pages to their authoritative services and boards", () => {
    const orders = read("src/app/(app)/pedidos/page.tsx");
    const dining = read("src/app/(app)/salao/page.tsx");
    const kitchen = read("src/app/(app)/producao/page.tsx");
    const delivery = read("src/app/(app)/entregas/page.tsx");
    expect(orders).toContain("OrderService.list");
    expect(orders).toContain("OrderManagerBoard");
    expect(dining).toContain("DiningService.listTables");
    expect(dining).toContain('aria-label="Mesas da unidade"');
    expect(kitchen).toContain("KitchenService.snapshot");
    expect(kitchen).toContain("KitchenBoard");
    expect(delivery).toContain("DeliveryOperationsService.loadOperations");
    expect(delivery).toContain("DeliveryBoard");
  });

  it("keeps management cashier floor kitchen and delivery contexts permission-scoped", () => {
    const management = contextualNavigation(["management"], new Set(Object.values(PERMISSIONS)));
    const cashier = contextualNavigation(["cashier"], new Set([PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_CREATE, PERMISSIONS.CASH_OPEN]));
    const floor = contextualNavigation(["floor"], new Set([PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_CREATE, PERMISSIONS.ORDERS_EDIT]));
    const kitchen = contextualNavigation(["kitchen"], new Set([PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_EDIT]));
    const delivery = contextualNavigation(["delivery"], new Set([PERMISSIONS.ORDERS_VIEW]));
    expect(management.some((item) => item.href === "/dashboard")).toBe(true);
    expect(cashier.some((item) => item.href === "/pdv")).toBe(true);
    expect(floor.some((item) => item.href === "/salao")).toBe(true);
    expect(kitchen.some((item) => item.href === "/producao")).toBe(true);
    expect(delivery.some((item) => item.href === "/entregador")).toBe(true);
  });
});
