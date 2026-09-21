import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  loadProductDetails: vi.fn(),
  addItem: vi.fn(),
  eqCalls: [] as Array<[string, unknown]>,
}));

const organizationId = "75000000-0000-4000-8000-000000000001";
const storeId = "75000000-0000-4000-8000-000000000002";

vi.mock("@/server/conversations/whatsapp-order-catalog", () => ({
  loadWhatsAppCatalogCandidates: vi.fn(),
  loadWhatsAppProductDetails: mocks.loadProductDetails,
  findWhatsAppCompositionProfiles: vi.fn(),
  loadWhatsAppCompositionProfile: vi.fn(),
}));

vi.mock("@/server/cart/cart-service", () => ({ CartService: { addItem: mocks.addItem } }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "orders") throw new Error(`Unexpected table ${table}`);
      const filters: Record<string, unknown> = {};
      const fixtures = [
        { organization_id: organizationId, store_id: storeId, display_number: 101, customer_phone_snapshot: "5500000000000", created_at: "2026-09-21T12:00:00Z" },
        { organization_id: organizationId, store_id: storeId, display_number: 102, customer_phone_snapshot: "5511999999999", created_at: "2026-09-21T11:00:00Z" },
        { organization_id: "other-organization", store_id: storeId, display_number: 201, customer_phone_snapshot: "5500000000000", created_at: "2026-09-21T10:00:00Z" },
        { organization_id: organizationId, store_id: "other-store", display_number: 301, customer_phone_snapshot: "5500000000000", created_at: "2026-09-21T09:00:00Z" },
      ];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          mocks.eqCalls.push([column, value]);
          return query;
        },
        order: () => query,
        limit: async () => ({
          data: fixtures
            .filter((row) => Object.entries(filters).every(([column, value]) => row[column as keyof typeof row] === value))
            .map(({ display_number, customer_phone_snapshot, created_at }) => ({ display_number, customer_phone_snapshot, created_at })),
          error: null,
        }),
      };
      return query;
    },
  }),
}));

import { loadRecentOwnedOrderNumbers } from "@/server/conversations/whatsapp-customer-context";
import { WhatsAppOrderService } from "@/server/conversations/whatsapp-order-service";

describe("FLOW-10 D09/D11 paused catalog and customer isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eqCalls.length = 0;
  });

  it("D09 drops stale modifier state when the product becomes sold out during the flow", async () => {
    mocks.loadProductDetails.mockResolvedValue({
      id: "75000000-0000-4000-8000-000000000010",
      name: "Produto Técnico Pausado",
      availability: "sold_out",
      modifierGroups: [],
    });

    const result = await WhatsAppOrderService.handle({
      organizationId,
      storeId,
      storeSlug: "flow10-technical-store",
      storeName: "Loja Técnica",
      contactName: "Cliente Técnico",
      contactPhone: "5500000000000",
      step: "order_items",
      text: "1",
      context: {
        channel: "whatsapp_order",
        version: 1,
        cartToken: "technical-cart-token",
        pendingModifiers: {
          productId: "75000000-0000-4000-8000-000000000010",
          name: "Produto Técnico Pausado",
          quantity: 1,
          currentGroupId: "75000000-0000-4000-8000-000000000020",
          completedGroupIds: [],
          selections: [],
        },
      },
    });

    expect(mocks.loadProductDetails).toHaveBeenCalledWith({
      organizationId,
      storeId,
      storeSlug: "flow10-technical-store",
      productId: "75000000-0000-4000-8000-000000000010",
    });
    expect(mocks.addItem).not.toHaveBeenCalled();
    expect(result.nextStep).toBe("order_items");
    expect(result.body).toContain("deixaram de estar disponíveis");
    expect(result.context?.pendingModifiers).toBeUndefined();
  });

  it("D11 returns only orders from the same tenant, store and WhatsApp owner", async () => {
    const result = await loadRecentOwnedOrderNumbers({
      organizationId,
      storeId,
      contactPhone: "+55 00 00000-0000",
      limit: 5,
    });

    expect(mocks.eqCalls).toContainEqual(["organization_id", organizationId]);
    expect(mocks.eqCalls).toContainEqual(["store_id", storeId]);
    expect(result).toEqual([101]);
    expect(result).not.toContain(102);
    expect(result).not.toContain(201);
    expect(result).not.toContain(301);
  });
});
