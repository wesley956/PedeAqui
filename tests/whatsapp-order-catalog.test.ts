import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: { business_type: "restaurant" as string } as { business_type: string } | null,
  storeError: null as Error | null,
  matched: [] as Array<Record<string, unknown>>,
  fallback: [] as Array<Record<string, unknown>>,
  search: vi.fn(),
  list: vi.fn(),
  adapterConstructor: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: mocks.store, error: mocks.storeError }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/server/intelligence/catalog-adapter", () => ({
  IntelligenceCatalogAdapter: class {
    constructor(context: unknown, slug: string) {
      mocks.adapterConstructor(context, slug);
    }

    search(query: string, options: unknown) {
      mocks.search(query, options);
      return Promise.resolve(mocks.matched);
    }

    list(options: unknown) {
      mocks.list(options);
      return Promise.resolve(mocks.fallback);
    }
  },
}));

import { loadWhatsAppCatalogCandidates } from "@/server/conversations/whatsapp-order-catalog";

const organizationId = "71000000-0000-4000-8000-000000000001";
const storeId = "71000000-0000-4000-8000-000000000002";

function catalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "71000000-0000-4000-8000-000000000010",
    categoryId: "71000000-0000-4000-8000-000000000020",
    categoryName: "Salgados",
    name: "Coxinha de Frango",
    description: "Tradicional",
    imageUrl: null,
    regularPriceCents: 1000,
    effectivePriceCents: 800,
    promotionLabel: "Oferta do dia",
    preparationTimeMinutes: 15,
    availability: "available",
    projection: { businessType: "restaurant", catalogLabel: "cardápio", itemLabel: "item", optionLabel: "adicional" },
    ...overrides,
  };
}

describe("WhatsApp canonical order catalog", () => {
  beforeEach(() => {
    mocks.store = { business_type: "restaurant" };
    mocks.storeError = null;
    mocks.matched = [];
    mocks.fallback = [];
    mocks.search.mockClear();
    mocks.list.mockClear();
    mocks.adapterConstructor.mockClear();
  });

  it("combines query matches with fallback candidates and deduplicates by product id", async () => {
    const matched = catalogItem();
    const fallbackOnly = catalogItem({
      id: "71000000-0000-4000-8000-000000000011",
      name: "Kibe",
      regularPriceCents: 900,
      effectivePriceCents: 900,
      promotionLabel: null,
    });
    mocks.matched = [matched];
    mocks.fallback = [matched, fallbackOnly];

    const result = await loadWhatsAppCatalogCandidates({
      organizationId,
      storeId,
      storeSlug: "dona-maria",
      query: "coxinha frango",
    });

    expect(mocks.search).toHaveBeenCalledWith("coxinha frango", { limit: 50 });
    expect(mocks.list).toHaveBeenCalledWith({ limit: 50 });
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual([
      "71000000-0000-4000-8000-000000000010",
      "71000000-0000-4000-8000-000000000011",
    ]);
  });

  it("maps the canonical effective promotional price without inventing a promotion", async () => {
    mocks.matched = [
      catalogItem(),
      catalogItem({
        id: "71000000-0000-4000-8000-000000000012",
        name: "Refrigerante",
        regularPriceCents: 700,
        effectivePriceCents: 700,
        promotionLabel: null,
      }),
    ];

    const result = await loadWhatsAppCatalogCandidates({
      organizationId,
      storeId,
      storeSlug: "dona-maria",
      query: "refri",
    });

    expect(result[0]).toMatchObject({ price_cents: 1000, promotional_price_cents: 800 });
    expect(result[1]).toMatchObject({ price_cents: 700, promotional_price_cents: null });
  });

  it("keeps a query-relevant item even when it is absent from the fallback list", async () => {
    const outsideFallback = catalogItem({
      id: "71000000-0000-4000-8000-000000000099",
      name: "Produto fora dos primeiros cinquenta",
    });
    mocks.matched = [outsideFallback];
    mocks.fallback = Array.from({ length: 50 }, (_, index) => catalogItem({
      id: `71000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      name: `Produto ${index + 1}`,
      regularPriceCents: 1000 + index,
      effectivePriceCents: 1000 + index,
    }));

    const result = await loadWhatsAppCatalogCandidates({
      organizationId,
      storeId,
      storeSlug: "dona-maria",
      query: "fora cinquenta",
    });

    expect(result.some((item) => item.id === outsideFallback.id)).toBe(true);
    expect(result).toHaveLength(51);
  });

  it("returns no candidates when the store scope cannot be resolved", async () => {
    mocks.store = null;

    const result = await loadWhatsAppCatalogCandidates({
      organizationId,
      storeId,
      storeSlug: "inexistente",
      query: "coxinha",
    });

    expect(result).toEqual([]);
    expect(mocks.adapterConstructor).not.toHaveBeenCalled();
  });
});
