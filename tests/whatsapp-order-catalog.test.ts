import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: { business_type: "restaurant" as string } as { business_type: string } | null,
  storeError: null as Error | null,
  matched: [] as Array<Record<string, unknown>>,
  fallback: [] as Array<Record<string, unknown>>,
  productDetails: new Map<string, Record<string, unknown> | null>(),
  publicMenu: null as Record<string, unknown> | null,
  search: vi.fn(),
  list: vi.fn(),
  productDetailsCall: vi.fn(),
  adapterConstructor: vi.fn(),
  getMenu: vi.fn(),
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

vi.mock("@/server/menu/public-menu-service", () => ({
  PublicMenuService: {
    getMenu: async (slug: string) => {
      mocks.getMenu(slug);
      return mocks.publicMenu;
    },
  },
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

    productDetails(productId: string) {
      mocks.productDetailsCall(productId);
      return Promise.resolve(mocks.productDetails.get(productId) ?? null);
    }
  },
}));

import {
  findWhatsAppCompositionProfiles,
  loadWhatsAppCatalogCandidates,
  loadWhatsAppCompositionProfile,
  loadWhatsAppProductDetails,
} from "@/server/conversations/whatsapp-order-catalog";

const organizationId = "71000000-0000-4000-8000-000000000001";
const storeId = "71000000-0000-4000-8000-000000000002";
const defaultProductId = "71000000-0000-4000-8000-000000000010";

function catalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: defaultProductId,
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

function productDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: defaultProductId,
    name: "Caixa 30 Salgados",
    description: null,
    imageUrl: null,
    regularPriceCents: 3000,
    effectivePriceCents: 3000,
    promotionLabel: null,
    preparationTimeMinutes: 20,
    availability: "available",
    sellable: true,
    operational: { scheduleOpen: true, acceptingOrders: true, canOrder: true, label: "open" },
    modifierGroups: [
      {
        id: "71000000-0000-4000-8000-000000000030",
        name: "Sabores",
        description: null,
        required: true,
        minSelection: 1,
        maxSelection: 5,
        selectionMode: "equal_split_options",
        distributionTotal: 30,
        modifiers: [
          { id: "71000000-0000-4000-8000-000000000040", name: "Coxinha", priceCents: 0 },
          { id: "71000000-0000-4000-8000-000000000041", name: "Bolinha de queijo", priceCents: 0 },
        ],
      },
      {
        id: "71000000-0000-4000-8000-000000000031",
        name: "Adicionais",
        description: null,
        required: false,
        minSelection: 0,
        maxSelection: 2,
        selectionMode: "distinct_choices",
        distributionTotal: null,
        modifiers: [
          { id: "71000000-0000-4000-8000-000000000042", name: "Molho especial", priceCents: 250 },
        ],
      },
    ],
    gas: null,
    projection: { businessType: "restaurant", catalogLabel: "cardápio", itemLabel: "item", optionLabel: "adicional" },
    ...overrides,
  };
}

function publicMenuProduct(id: string, availability: "available" | "sold_out" = "available") {
  return {
    id,
    name: `Produto ${id.slice(-4)}`,
    description: null,
    image_url: null,
    price_cents: 1000,
    promotional_price_cents: null,
    promotion_label: null,
    preparation_time_minutes: 10,
    availability,
  };
}

function publicMenu(products: Array<Record<string, unknown>>) {
  return {
    store: { id: storeId },
    categories: [{ id: "71000000-0000-4000-8000-000000000090", name: "Todos", products }],
  };
}

describe("WhatsApp canonical order catalog", () => {
  beforeEach(() => {
    mocks.store = { business_type: "restaurant" };
    mocks.storeError = null;
    mocks.matched = [];
    mocks.fallback = [];
    mocks.productDetails = new Map();
    mocks.publicMenu = null;
    mocks.search.mockClear();
    mocks.list.mockClear();
    mocks.productDetailsCall.mockClear();
    mocks.adapterConstructor.mockClear();
    mocks.getMenu.mockClear();
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

    const result = await loadWhatsAppCatalogCandidates({ organizationId, storeId, storeSlug: "dona-maria", query: "coxinha frango" });

    expect(mocks.search).toHaveBeenCalledWith("coxinha frango", { limit: 50 });
    expect(mocks.list).toHaveBeenCalledWith({ limit: 50 });
    expect(result.map((item) => item.id)).toEqual([defaultProductId, "71000000-0000-4000-8000-000000000011"]);
  });

  it("maps the canonical effective promotional price without inventing a promotion", async () => {
    mocks.matched = [
      catalogItem(),
      catalogItem({ id: "71000000-0000-4000-8000-000000000012", name: "Refrigerante", regularPriceCents: 700, effectivePriceCents: 700, promotionLabel: null }),
    ];

    const result = await loadWhatsAppCatalogCandidates({ organizationId, storeId, storeSlug: "dona-maria", query: "refri" });

    expect(result[0]).toMatchObject({ price_cents: 1000, promotional_price_cents: 800 });
    expect(result[1]).toMatchObject({ price_cents: 700, promotional_price_cents: null });
  });

  it("keeps a query-relevant item even when it is absent from the fallback list", async () => {
    const outsideFallback = catalogItem({ id: "71000000-0000-4000-8000-000000000099", name: "Produto fora dos primeiros cinquenta" });
    mocks.matched = [outsideFallback];
    mocks.fallback = Array.from({ length: 50 }, (_, index) => catalogItem({
      id: `71000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      name: `Produto ${index + 1}`,
      regularPriceCents: 1000 + index,
      effectivePriceCents: 1000 + index,
    }));

    const result = await loadWhatsAppCatalogCandidates({ organizationId, storeId, storeSlug: "dona-maria", query: "fora cinquenta" });

    expect(result.some((item) => item.id === outsideFallback.id)).toBe(true);
    expect(result).toHaveLength(51);
  });

  it("returns no candidates when the store scope cannot be resolved", async () => {
    mocks.store = null;
    const result = await loadWhatsAppCatalogCandidates({ organizationId, storeId, storeSlug: "inexistente", query: "coxinha" });
    expect(result).toEqual([]);
    expect(mocks.adapterConstructor).not.toHaveBeenCalled();
  });

  it("loads product details from the same canonical adapter used by menu and checkout", async () => {
    mocks.productDetails.set(defaultProductId, productDetails());
    const result = await loadWhatsAppProductDetails({ organizationId, storeId, storeSlug: "dona-maria", productId: defaultProductId });
    expect(mocks.productDetailsCall).toHaveBeenCalledWith(defaultProductId);
    expect(result?.modifierGroups).toHaveLength(2);
    expect(result?.modifierGroups[1]).toMatchObject({ required: false, minSelection: 0, maxSelection: 2 });
  });

  it("preserves equal-split limits and canonical option prices", async () => {
    mocks.productDetails.set(defaultProductId, productDetails());
    const result = await loadWhatsAppCompositionProfile({ organizationId, storeId, storeSlug: "dona-maria", productId: defaultProductId });
    expect(result).toMatchObject({
      productId: defaultProductId,
      groupName: "Sabores",
      distributionTotal: 30,
      required: true,
      minSelection: 1,
      maxSelection: 5,
    });
    expect(result?.modifiers).toEqual([
      { id: "71000000-0000-4000-8000-000000000040", name: "Coxinha", priceCents: 0 },
      { id: "71000000-0000-4000-8000-000000000041", name: "Bolinha de queijo", priceCents: 0 },
    ]);
  });

  it("does not expose sold-out product options to the WhatsApp composition flow", async () => {
    mocks.productDetails.set(defaultProductId, productDetails({ availability: "sold_out", sellable: false }));
    const result = await loadWhatsAppCompositionProfile({ organizationId, storeId, storeSlug: "dona-maria", productId: defaultProductId });
    expect(result).toBeNull();
  });

  it("reflects renamed canonical options without keeping stale WhatsApp names", async () => {
    const details = productDetails();
    const groups = (details.modifierGroups as Array<Record<string, unknown>>).map((group, index) => index === 0 ? {
      ...group,
      modifiers: [
        { id: "71000000-0000-4000-8000-000000000040", name: "Coxinha de frango", priceCents: 0 },
        { id: "71000000-0000-4000-8000-000000000041", name: "Bolinha de queijo", priceCents: 0 },
      ],
    } : group);
    mocks.productDetails.set(defaultProductId, { ...details, modifierGroups: groups });

    const result = await loadWhatsAppCompositionProfile({ organizationId, storeId, storeSlug: "dona-maria", productId: defaultProductId });
    expect(result?.modifiers[0]?.name).toBe("Coxinha de frango");
  });

  it("preserves optional groups and paid additions in canonical product details", async () => {
    mocks.productDetails.set(defaultProductId, productDetails());
    const result = await loadWhatsAppProductDetails({ organizationId, storeId, storeSlug: "dona-maria", productId: defaultProductId });
    expect(result?.modifierGroups[1]).toMatchObject({
      name: "Adicionais",
      required: false,
      minSelection: 0,
      maxSelection: 2,
      selectionMode: "distinct_choices",
    });
    expect(result?.modifierGroups[1]?.modifiers[0]).toEqual({
      id: "71000000-0000-4000-8000-000000000042",
      name: "Molho especial",
      priceCents: 250,
    });
  });

  it("finds a composition product beyond the first 50 canonical menu items", async () => {
    const ids = Array.from({ length: 61 }, (_, index) => `71000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`);
    const targetId = ids[60]!;
    mocks.publicMenu = publicMenu(ids.map((id) => publicMenuProduct(id)));
    for (const id of ids) mocks.productDetails.set(id, productDetails({ id, name: `Produto ${id.slice(-4)}`, modifierGroups: [] }));
    mocks.productDetails.set(targetId, productDetails({ id: targetId, name: "Caixa especial 30" }));

    const result = await findWhatsAppCompositionProfiles({ organizationId, storeId, storeSlug: "dona-maria", distributionTotal: 30 });

    expect(mocks.getMenu).toHaveBeenCalledWith("dona-maria");
    expect(mocks.productDetailsCall).toHaveBeenCalledTimes(61);
    expect(result).toHaveLength(1);
    expect(result[0]?.productId).toBe(targetId);
  });

  it("fails closed when the public menu resolves to another store", async () => {
    mocks.publicMenu = { store: { id: "71000000-0000-4000-8000-000000000999" }, categories: [] };
    const result = await findWhatsAppCompositionProfiles({ organizationId, storeId, storeSlug: "dona-maria", distributionTotal: 30 });
    expect(result).toEqual([]);
    expect(mocks.productDetailsCall).not.toHaveBeenCalled();
  });
});
