import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reviewCheckout } from "@/server/checkout/review";
import { buildPublicOrderTimeline } from "@/features/orders/public-order-timeline";

const read = (path: string) => readFileSync(path, "utf8");

const menuPage = read("src/app/m/[slug]/page.tsx");
const productPage = read("src/app/m/[slug]/produto/[id]/page.tsx");
const modifierSelector = read("src/features/menu/modifier-group-selector.tsx");
const complementsService = read("src/server/menu/complement-category-service.ts");
const complementsMigration = read("supabase/sql/135_public_complement_categories.sql");
const complementsSecurity = read("supabase/sql/136_public_complement_categories_security.sql");
const quantityMigration = read("supabase/sql/134_modifier_quantity_selection.sql");
const cartBar = read("src/features/cart/public-cart-bar.tsx");
const cartBarService = read("src/server/cart/public-cart-summary-service.ts");
const cartReplace = read("supabase/sql/138_public_cart_atomic_item_replace.sql");
const checkoutPage = read("src/app/m/[slug]/checkout/page.tsx");
const orderPage = read("src/app/m/[slug]/pedido/[id]/page.tsx");
const orderTrackingCss = read("src/app/m/[slug]/pedido/[id]/order-tracking.module.css");
const workflow = read(".github/workflows/ci.yml");

describe("PA-PUBLIC-UX-008 final homologation gate", () => {
  it("keeps the approved menu incremental instead of replacing the public entry flow", () => {
    expect(menuPage).toContain("MenuBrowser");
    expect(menuPage).toContain("PublicCartBar");
    expect(productPage).toContain("Adicionar ao carrinho");
    expect(productPage).toContain("ModifierGroupSelector");
    expect(productPage).toContain("ComplementCategorySection");
    expect(productPage).toContain("PublicCartBar");
  });

  it("treats quantity-per-option as a bounded maximum, not an exact-fill requirement", () => {
    expect(quantityMigration).toContain("quantity_per_option");
    expect(quantityMigration).toContain("check (quantity between 1 and 100)");
    expect(modifierSelector).toContain("const complete = total >= minimum && total <= group.max_selection");
    expect(modifierSelector).toContain("if (delta > 0 && currentTotal >= group.max_selection) return current");
    expect(modifierSelector).toContain("Até ${group.max_selection} unidade(s) no total");
    expect(modifierSelector).not.toContain("faltam escolher");
  });

  it("keeps complementary categories optional, scoped and restaurant-aware", () => {
    expect(complementsMigration).toContain("store_complement_categories");
    expect(complementsMigration).toContain("s.business_type='restaurant'");
    expect(complementsService).toContain('store.business_type === "restaurant"');
    expect(complementsService).toContain('.eq("organization_id", store.organization_id).eq("store_id", store.id)');
    expect(productPage).toContain("Cross-sell is optional merchandising");
    expect(complementsSecurity).toContain("store_complement_categories_deny_direct");
  });

  it("keeps the persistent cart authoritative and isolated by store/token", () => {
    expect(cartBar).toContain("cartCookieName(storeSlug)");
    expect(cartBarService).toContain('.eq("organization_id", store.organization_id)');
    expect(cartBarService).toContain('.eq("store_id", store.id)');
    expect(cartBarService).toContain('.eq("token_hash", hashCartToken(token))');
    expect(cartBar).not.toContain("localStorage");
  });

  it("replaces edited cart assemblies atomically after authoritative repricing", () => {
    const addNew = cartReplace.indexOf("cart_add_item_internal");
    const deleteOld = cartReplace.indexOf("delete from public.cart_items");
    expect(addNew).toBeGreaterThan(-1);
    expect(deleteOld).toBeGreaterThan(addNew);
    expect(cartReplace).toContain("cart product mismatch");
    expect(cartReplace).toContain("revoke all on function public.cart_replace_item_internal");
    expect(cartReplace).toContain("to service_role");
  });

  it("keeps delivery and pickup checkout review authoritative", () => {
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
    expect(reviewCheckout({ ...base, paymentMethod: "cash", enabledPaymentMethods: ["pix"], fulfillmentType: "pickup", deliveryQuoteStatus: "not_required" }).ready).toBe(false);
    expect(reviewCheckout({ ...base, fulfillmentType: "delivery", deliveryQuoteStatus: "unserviceable", enabledPaymentMethods: [...base.enabledPaymentMethods] }).ready).toBe(false);
    expect(checkoutPage).toContain("data.paymentMethods.filter((item) => item.enabled)");
    expect(checkoutPage).toContain("Confirmar pedido ·");
  });

  it("projects only canonical order and fulfillment states in tracking", () => {
    const readyDelivery = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "assigned" });
    expect(readyDelivery.find((step) => step.key === "ready")?.state).toBe("current");
    expect(readyDelivery.find((step) => step.key === "out")?.state).toBe("upcoming");

    const out = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "out_for_delivery" });
    expect(out.find((step) => step.key === "out")?.state).toBe("current");

    const pickup = buildPublicOrderTimeline({ fulfillmentType: "pickup", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "awaiting_pickup" });
    expect(pickup.some((step) => step.key === "out")).toBe(false);
    expect(pickup.find((step) => step.key === "ready")?.state).toBe("current");

    expect(orderPage).toContain("orderCookieName(slug, id)");
    expect(orderPage).toContain("PublicOrderService.get(slug, id, accessToken)");
    expect(orderPage).toContain("item.modifiers.map(modifierText)");
    expect(orderPage).not.toContain("Acompanhar entrega");
  });

  it("preserves mobile accessibility and reduced-motion/safe-area contracts", () => {
    const cartCss = read("src/features/cart/public-cart-bar.module.css");
    expect(cartCss).toContain("env(safe-area-inset-bottom)");
    expect(cartCss).toContain(":focus-visible");
    expect(modifierSelector).toContain("prefers-reduced-motion: reduce");
    expect(orderTrackingCss).toContain(":focus-visible");
    expect(orderTrackingCss).toContain("@media(max-width:640px)");
  });

  it("enforces three consecutive main-journey passes on the same CI checkout", () => {
    expect(workflow).toContain("E2E context journeys — 3 consecutive passes");
    expect(workflow).toContain("for attempt in 1 2 3");
    expect(workflow).toContain("PUBLIC_UX_JOURNEY_PASS=${attempt}/3");
    expect(workflow).toContain("npm run test:e2e");
  });
});
