import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectivePromotionalPrice } from "@/server/promotions/effective-price";
import { StoreOrderStatus } from "@/features/menu/store-order-status";
import { resolveStoreOperationalStatus } from "@/server/menu/store-operational-status-core";
import { CheckoutInput } from "@/features/checkout/checkout-input";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ schedules: [] as Array<Record<string, unknown>>, productPrice: 3900, legacyPrice: null as number | null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const rows: Record<string, unknown> = {
    stores: { id: "store", organization_id: "org", status: "active", business_type: "restaurant", timezone: "America/Sao_Paulo" },
    store_complement_categories: [{ category_id: "churros", sort_order: 0 }],
    categories: [{ id: "churros", name: "Churros", active: true }],
    products: [{ id: "product", category_id: "churros", name: "Caixa com 50 mini churros", price_cents: mocks.productPrice, promotional_price_cents: mocks.legacyPrice }],
    product_modifier_groups: [],
  };
  const result = { data: rows[table] ?? [], error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "ilike", "in", "eq", "is", "order"]) builder[method] = () => builder;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
} }) }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ rpc: async () => ({ data: mocks.schedules, error: null }) }) }));

import { ComplementCategoryService } from "@/server/menu/complement-category-service";

describe("public menu improvements #1210", () => {
  beforeEach(() => {
    mocks.productPrice = 3900;
    mocks.legacyPrice = null;
    mocks.schedules = [{ product_id: "product", promotional_price_cents: 3690, weekdays: [2], active: true, starts_at: "13:00", ends_at: "23:00", starts_on: null, ends_on: null }];
  });

  it("loads the scheduled R$36.90 complement through the real service in store timezone", async () => {
    const result = await ComplementCategoryService.loadPublic("store", null, 4, new Date("2026-10-06T17:00:00Z"));
    expect(result[0]?.products[0]).toMatchObject({ priceCents: 3900, promotionalPriceCents: 3690, requiresConfiguration: false });
  });

  it("stops displaying the scheduled discount outside its window", async () => {
    mocks.legacyPrice = 3500;
    const result = await ComplementCategoryService.loadPublic("store", null, 4, new Date("2026-10-06T15:00:00Z"));
    expect(result[0]?.products[0]?.promotionalPriceCents).toBeNull();
  });

  it("keeps legacy promotions when no schedules are returned", async () => {
    mocks.schedules = [];
    mocks.legacyPrice = 3700;
    const result = await ComplementCategoryService.loadPublic("store", null, 4);
    expect(result[0]?.products[0]?.promotionalPriceCents).toBe(3700);
  });

  it.each([3900, 4000, -1, 3.5])("rejects an invalid promotional price %s", (price) => {
    expect(effectivePromotionalPrice({ priceCents: 3900, legacyPromotionalPriceCents: null, hasSchedule: true, promotion: { promotional_price_cents: price } })).toBeNull();
  });

  it("chooses the cheapest simultaneous promotion", async () => {
    mocks.schedules.push({ ...mocks.schedules[0], promotional_price_cents: 3600 });
    const result = await ComplementCategoryService.loadPublic("store", null, 4, new Date("2026-10-06T17:00:00Z"));
    expect(result[0]?.products[0]?.promotionalPriceCents).toBe(3600);
  });

  it("renders reopening derived from the same schedule used to block orders", () => {
    const operational = resolveStoreOperationalStatus({ storeStatus: "active", acceptingOrders: true, timeZone: "America/Sao_Paulo", hours: [{ weekday: 2, opens_at: "13:40", closes_at: "23:00", closes_next_day: false }], now: new Date("2026-10-06T07:00:00Z") });
    const html = renderToStaticMarkup(createElement(StoreOrderStatus, { operational }));
    expect(operational.canOrder).toBe(false);
    expect(html).toContain("Abre hoje às 13:40");
    expect(html).toContain('role="status"');
    expect(html).toContain("confirmação estará disponível");
  });

  it("does not promise reopening during a manual pause", () => {
    const operational = resolveStoreOperationalStatus({ storeStatus: "active", acceptingOrders: false, pauseReason: "Cozinha em manutenção", hours: [], timeZone: "UTC" });
    const html = renderToStaticMarkup(createElement(StoreOrderStatus, { operational }));
    expect(html).toContain("Cozinha em manutenção");
    expect(html).not.toContain("Abre");
  });

  it("renders no warning for an open store", () => {
    expect(renderToStaticMarkup(createElement(StoreOrderStatus, { operational: { canOrder: true, label: "open" } }))).toBe("");
  });

  it("shows Portuguese required-field feedback and clears it as the customer types", () => {
    const input = CheckoutInput({ label: "WhatsApp", name: "phone", required: true });
    const setCustomValidity = vi.fn();
    const event = { currentTarget: { validity: { valueMissing: true, valid: false }, setCustomValidity } };
    input.props.onInvalid(event);
    expect(setCustomValidity).toHaveBeenLastCalledWith("Preencha whatsapp.");
    input.props.onInput(event);
    expect(setCustomValidity).toHaveBeenLastCalledWith("");
  });

  it("translates invalid email feedback", () => {
    const input = CheckoutInput({ label: "E-mail", type: "email" });
    const setCustomValidity = vi.fn();
    input.props.onInvalid({ currentTarget: { validity: { valueMissing: false, typeMismatch: true, valid: false }, setCustomValidity } });
    expect(setCustomValidity).toHaveBeenLastCalledWith("Informe um e-mail válido.");
  });
});
