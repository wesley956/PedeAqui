import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ids = {
  organization: "75000000-0000-4000-8000-000000000001",
  store: "75000000-0000-4000-8000-000000000002",
  category: "75000000-0000-4000-8000-000000000003",
  product: "75000000-0000-4000-8000-000000000004",
  group: "75000000-0000-4000-8000-000000000005",
  modifier: "75000000-0000-4000-8000-000000000006",
};

const mocks = vi.hoisted(() => ({ publicRpc: vi.fn(), adminRpc: vi.fn() }));

function query(data: unknown) {
  const value = { data, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "ilike", "in", "order", "limit", "gt"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => value;
  builder.then = (resolve: (result: typeof value) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return builder;
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ rpc: mocks.publicRpc }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.adminRpc,
    from: (table: string) => {
      const weekday = new Date().getUTCDay();
      const rows: Record<string, unknown> = {
        stores: { id: ids.store, organization_id: ids.organization, slug: "flow10-public-store", name: "Loja Técnica FLOW-10", business_type: "restaurant", status: "active", timezone: "UTC" },
        store_menu_settings: { active: true, accepting_orders: true },
        store_hours: [{ weekday, opens_at: "00:00:00", closes_at: "23:59:00", closes_next_day: false }],
        products: { id: ids.product, name: "Produto Técnico", image_url: null, price_cents: 2500, promotional_price_cents: null, active: true, availability: "available", deleted_at: null },
        product_modifier_groups: [{ modifier_group_id: ids.group, sort_order: 0 }],
        modifier_groups: [{ id: ids.group, name: "Opção técnica", min_selection: 1, max_selection: 1, required: true, selection_mode: "distinct_choices", distribution_total: null, active: true, deleted_at: null }],
        modifiers: [{ id: ids.modifier, modifier_group_id: ids.group, name: "Adicional técnico", price_cents: 300, active: true, deleted_at: null, sort_order: 0 }],
        orders: { id: "75000000-0000-4000-8000-000000000008", display_number: 907, channel: "digital_menu", fulfillment_type: "delivery", order_status: "confirmed", payment_status: "pending", production_status: "preparing", fulfillment_status: "pending", total_cents: 2800, scheduled_for: null, delivery_estimated_min_minutes: 30, delivery_estimated_max_minutes: 45, confirmed_at: "2026-09-21T12:00:00.000Z", completed_at: null, canceled_at: null, created_at: "2026-09-21T11:59:00.000Z", updated_at: "2026-09-21T12:01:00.000Z" },
      };
      return query(rows[table] ?? null);
    },
  }),
}));

vi.mock("@/server/promotions/promotion-service", () => ({
  isPromotionActive: () => false,
  PromotionService: {
    schedulesForStore: vi.fn(async () => []),
    activeForProduct: vi.fn(async () => null),
  },
}));

import { CartService } from "@/server/cart/cart-service";
import { PublicMenuService } from "@/server/menu/public-menu-service";
import { PublicOrderService } from "@/server/orders/public-order-service";

function publicMenuPayload() {
  return {
    store: {
      id: ids.store, name: "Loja Técnica FLOW-10", slug: "flow10-public-store", phone: null,
      postal_code: null, street: null, number: null, complement: null, district: null,
      city: null, state: null, public_whatsapp: null, website_url: null, instagram_url: null,
      facebook_url: null, tiktok_url: null, timezone: "UTC", status: "active", business_type: "restaurant",
    },
    settings: {
      theme: "default", primary_color: "#FF6B00", logo_url: null, cover_url: null,
      show_search: true, show_categories: true, show_product_images: true, allow_pickup: true,
      allow_delivery: true, minimum_order_cents: 0, active: true, accepting_orders: true, pause_reason: null,
    },
    delivery: { enabled: true, fee_mode: "default", default_fee_cents: 500, free_delivery_over_cents: null, estimated_min_minutes: 30, estimated_max_minutes: 45, starting_fee_cents: 500 },
    hours: [{ weekday: 1, opens_at: "00:00", closes_at: "23:59", closes_next_day: false }],
    categories: [{ id: ids.category, name: "Categoria técnica", description: null, image_url: null, products: [{ id: ids.product, name: "Produto Técnico", description: null, image_url: null, price_cents: 2500, promotional_price_cents: null, promotion_label: null, preparation_time_minutes: 10, availability: "available" }] }],
  };
}

describe("FLOW-10 A01/A02 public entry and canonical cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicRpc.mockResolvedValue({ data: publicMenuPayload(), error: null });
    mocks.adminRpc.mockResolvedValue({ data: { cart_item_id: "75000000-0000-4000-8000-000000000007" }, error: null });
  });

  it("A01 opens the public menu through the canonical projection", async () => {
    const menu = await PublicMenuService.getMenu("flow10-public-store", new Date("2026-09-21T12:00:00.000Z"));

    expect(mocks.publicRpc).toHaveBeenCalledWith("get_public_menu", { p_store_slug: "flow10-public-store" });
    expect(menu?.store.id).toBe(ids.store);
    expect(menu?.categories[0]?.products[0]).toMatchObject({ id: ids.product, availability: "available" });
    expect(menu?.operational).toEqual({ scheduleOpen: true, acceptingOrders: true, canOrder: true, label: "open" });
  });

  it("A02 prices and persists one simple item with its canonical modifier snapshot", async () => {
    const result = await CartService.addItem({
      storeSlug: "flow10-public-store",
      productId: ids.product,
      quantity: 1,
      note: null,
      modifierIds: [],
      modifierSelections: [{ modifierId: ids.modifier, quantity: 1 }],
      gasSaleMode: null,
    }, "flow10-technical-cart-token");

    expect(result.token).toBe("flow10-technical-cart-token");
    expect(mocks.adminRpc).toHaveBeenCalledWith("cart_add_item_internal", expect.objectContaining({
      p_organization_id: ids.organization,
      p_store_id: ids.store,
      p_product_id: ids.product,
      p_product_name: "Produto Técnico",
      p_unit_base_price_cents: 2500,
      p_quantity: 1,
      p_modifiers: [{
        group_id: ids.group,
        group_name: "Opção técnica",
        modifier_id: ids.modifier,
        modifier_name: "Adicional técnico",
        unit_price_cents: 300,
        quantity: 1,
      }],
    }));
  });

  it("C03 keeps token-protected tracking available while the same store is closed", async () => {
    const closedPayload = publicMenuPayload();
    closedPayload.store.status = "temporarily_closed";
    closedPayload.settings.accepting_orders = false;
    mocks.publicRpc.mockResolvedValueOnce({ data: closedPayload, error: null });

    const menu = await PublicMenuService.getMenu("flow10-public-store", new Date("2026-09-21T12:00:00.000Z"));
    const tracking = await PublicOrderService.getTracking(
      "flow10-public-store",
      "75000000-0000-4000-8000-000000000008",
      "flow10-legitimate-order-token",
    );

    expect(menu?.operational).toMatchObject({ canOrder: false, label: "closed" });
    expect(tracking).toMatchObject({
      store: { id: ids.store, organization_id: ids.organization },
      order: { id: "75000000-0000-4000-8000-000000000008", display_number: 907, production_status: "preparing" },
    });
  });
});
