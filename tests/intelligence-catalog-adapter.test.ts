import { describe, expect, it, vi } from "vitest";
import type { BusinessType } from "@/modules/module-catalog";

vi.mock("@/server/menu/public-menu-service", () => ({
  PublicMenuService: {
    getMenu: async () => null,
    getProduct: async () => null,
  },
}));

vi.mock("@/server/promotions/promotion-service", () => ({
  PromotionService: {
    activeForStore: async () => [],
  },
}));

import {
  CatalogScopeError,
  IntelligenceCatalogAdapter,
  INTELLIGENCE_CANONICAL_CATALOG_FLAG,
  INTELLIGENCE_CANONICAL_CATALOG_MODE,
} from "@/server/intelligence/catalog-adapter";
import { createIntelligenceContext } from "@/server/intelligence/context";
import type { PublicMenuState, PublicProductState } from "@/server/menu/public-menu-service";
import type { ProductPromotion } from "@/server/promotions/promotion-service";

const organizationId = "61000000-0000-4000-8000-000000000001";
const storeId = "61000000-0000-4000-8000-000000000002";
const otherStoreId = "61000000-0000-4000-8000-000000000003";
const productId = "61000000-0000-4000-8000-000000000010";
const soldOutId = "61000000-0000-4000-8000-000000000011";
const categoryId = "61000000-0000-4000-8000-000000000020";
const groupId = "61000000-0000-4000-8000-000000000030";
const modifierA = "61000000-0000-4000-8000-000000000040";
const modifierB = "61000000-0000-4000-8000-000000000041";

function context(businessType: BusinessType = "restaurant", currentStoreId = storeId) {
  return createIntelligenceContext({
    requestId: "catalog-test",
    correlationId: "catalog-correlation",
    organizationId,
    storeId: currentStoreId,
    channel: "whatsapp",
    businessType,
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: null, mode: "bot" },
    identity: { source: "whatsapp_contact", trust: "verified", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId: null },
    external: { provider: null, accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: true, revision: "cap:catalog" },
  });
}

function menu(overrides: Partial<PublicMenuState> = {}): PublicMenuState {
  return {
    store: {
      id: storeId,
      name: "Dona Maria",
      slug: "dona-maria",
      phone: null,
      postal_code: null,
      street: null,
      number: null,
      complement: null,
      district: null,
      city: "Nova Odessa",
      state: "SP",
      public_whatsapp: null,
      website_url: null,
      instagram_url: null,
      facebook_url: null,
      tiktok_url: null,
      timezone: "America/Sao_Paulo",
      status: "active",
      business_type: "restaurant",
    },
    settings: {
      theme: "dark",
      primary_color: "#FF6B00",
      logo_url: null,
      cover_url: null,
      show_search: true,
      show_categories: true,
      show_product_images: true,
      allow_pickup: true,
      allow_delivery: true,
      minimum_order_cents: 0,
      active: true,
      accepting_orders: true,
      pause_reason: null,
    },
    delivery: {} as PublicMenuState["delivery"],
    hours: [],
    categories: [{
      id: categoryId,
      name: "Salgados",
      description: null,
      image_url: null,
      products: [
        {
          id: productId,
          name: "Coxinha de Frango",
          description: "Coxinha tradicional",
          image_url: null,
          price_cents: 1000,
          promotional_price_cents: 800,
          promotion_label: "Oferta do dia",
          preparation_time_minutes: 15,
          availability: "available",
        },
        {
          id: soldOutId,
          name: "Kibe",
          description: null,
          image_url: null,
          price_cents: 900,
          promotional_price_cents: null,
          promotion_label: null,
          preparation_time_minutes: 10,
          availability: "sold_out",
        },
      ],
    }],
    businessType: "restaurant",
    operational: { scheduleOpen: true, acceptingOrders: true, canOrder: true, label: "open" },
    ...overrides,
  };
}

function product(overrides: Partial<PublicProductState> = {}): PublicProductState {
  return {
    store: {
      id: storeId,
      name: "Dona Maria",
      slug: "dona-maria",
      status: "active",
      timezone: "America/Sao_Paulo",
      business_type: "restaurant",
    },
    settings: { active: true, accepting_orders: true, pause_reason: null },
    hours: [],
    product: {
      id: productId,
      name: "Coxinha de Frango",
      description: "Coxinha tradicional",
      image_url: null,
      price_cents: 1000,
      promotional_price_cents: 800,
      promotion_label: "Oferta do dia",
      preparation_time_minutes: 15,
      availability: "available",
      modifier_groups: [{
        id: groupId,
        name: "Escolha os sabores",
        description: "Monte o sortido",
        min_selection: 2,
        max_selection: 2,
        required: true,
        selection_mode: "equal_split_options",
        distribution_total: 6,
        modifiers: [
          { id: modifierA, name: "Frango", price_cents: 100 },
          { id: modifierB, name: "Carne", price_cents: 200 },
        ],
      }],
    },
    businessType: "restaurant",
    gas: null,
    operational: { scheduleOpen: true, acceptingOrders: true, canOrder: true, label: "open" },
    ...overrides,
  };
}

function promotion(overrides: Partial<ProductPromotion> = {}): ProductPromotion {
  return {
    id: "61000000-0000-4000-8000-000000000050",
    promotion_group_id: "61000000-0000-4000-8000-000000000051",
    campaign_name: "Semana da Coxinha",
    organization_id: organizationId,
    store_id: storeId,
    product_id: productId,
    promotional_price_cents: 800,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    starts_on: null,
    ends_on: null,
    starts_at: null,
    ends_at: null,
    label: "Oferta do dia",
    active: true,
    ...overrides,
  };
}

function adapter(options: {
  menuState?: PublicMenuState | null;
  productState?: PublicProductState | null;
  promotions?: ProductPromotion[];
  businessType?: BusinessType;
  contextStoreId?: string;
  onPromotionQuery?: (storeId: string, timeZone: string, now?: Date) => void;
} = {}) {
  const menuState = options.menuState === undefined ? menu() : options.menuState;
  const productState = options.productState === undefined ? product() : options.productState;
  return new IntelligenceCatalogAdapter(
    context(options.businessType ?? "restaurant", options.contextStoreId ?? storeId),
    "dona-maria",
    {
      getMenu: async () => menuState,
      getProduct: async () => productState,
      activePromotions: async (currentStoreId, timeZone, now) => {
        options.onPromotionQuery?.(currentStoreId, timeZone, now);
        return options.promotions ?? [promotion()];
      },
    },
  );
}

describe("IntelligenceCatalogAdapter", () => {
  it("is explicitly shadow-gated for canonical catalog rollout", () => {
    expect(INTELLIGENCE_CANONICAL_CATALOG_FLAG).toBe("intelligence_canonical_catalog");
    expect(INTELLIGENCE_CANONICAL_CATALOG_MODE).toBe("shadow");
  });

  it("searches the canonical public menu with name approximation and never offers sold-out products", async () => {
    const results = await adapter().search("coxina frango");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: productId,
      name: "Coxinha de Frango",
      regularPriceCents: 1000,
      effectivePriceCents: 800,
      availability: "available",
    });
    expect(results.some((result) => result.id === soldOutId)).toBe(false);
  });

  it("deduplicates the synthetic promotion category and preserves the canonical category", async () => {
    const base = menu();
    const promotedProduct = base.categories[0]!.products[0]!;
    const menuWithSyntheticPromotionCategory = menu({
      categories: [
        {
          id: "61000000-0000-4000-8000-000000000099",
          name: "🔥 Promoções",
          description: null,
          image_url: null,
          products: [promotedProduct],
        },
        ...base.categories,
      ],
    });
    const results = await adapter({ menuState: menuWithSyntheticPromotionCategory }).list();
    expect(results.filter((result) => result.id === productId)).toHaveLength(1);
    expect(results.find((result) => result.id === productId)?.categoryName).toBe("Salgados");
  });

  it("exposes list, item detail and availability aliases over the same canonical truth", async () => {
    const listed = await adapter().list();
    const details = await adapter().itemDetail(productId);
    const availability = await adapter().availability(productId);
    expect(listed.some((item) => item.id === productId)).toBe(true);
    expect(details?.id).toBe(productId);
    expect(availability).toMatchObject({ productId, availability: "available", sellable: true });
  });

  it("returns product composition without guessing required modifiers", async () => {
    const details = await adapter().productDetails(productId);
    expect(details?.modifierGroups[0]).toMatchObject({ required: true, minSelection: 2, maxSelection: 2, selectionMode: "equal_split_options" });
    expect(details?.modifierGroups[0]?.modifiers.map((item) => item.name)).toEqual(["Frango", "Carne"]);
  });

  it("fails closed when required composition is missing", async () => {
    await expect(adapter().revalidatePrice({ productId, quantity: 1 })).rejects.toMatchObject({ code: "invalid_modifiers" });
  });

  it("revalidates promotional price and composed sortido using the cart canonical pricing engine", async () => {
    const result = await adapter().revalidatePrice({
      productId,
      quantity: 2,
      modifierSelections: [
        { modifierId: modifierA, quantity: 3 },
        { modifierId: modifierB, quantity: 3 },
      ],
    });
    expect(result).toMatchObject({
      regularPriceCents: 1000,
      effectiveBasePriceCents: 800,
      promotionApplied: true,
      modifiersUnitPriceCents: 900,
      unitTotalPriceCents: 1700,
      lineTotalCents: 3400,
    });
  });

  it("lists only canonical active promotions for currently sellable products", async () => {
    const promotions = await adapter().promotions();
    expect(promotions).toEqual([expect.objectContaining({
      productId,
      regularPriceCents: 1000,
      promotionalPriceCents: 800,
      campaignName: "Semana da Coxinha",
    })]);
  });

  it("delegates promotion timezone and evaluation instant to the canonical promotion source", async () => {
    const now = new Date("2026-09-13T04:30:00.000Z");
    let query: { storeId: string; timeZone: string; now?: Date } | null = null;
    await adapter({
      onPromotionQuery: (currentStoreId, timeZone, currentNow) => {
        query = { storeId: currentStoreId, timeZone, now: currentNow };
      },
    }).promotions(now);
    expect(query).toEqual({ storeId, timeZone: "America/Sao_Paulo", now });
  });

  it("does not expose a sold-out product as sellable", async () => {
    const soldOut = product({ product: { ...product().product, id: soldOutId, availability: "sold_out" } });
    const details = await adapter({ productState: soldOut }).productDetails(soldOutId);
    expect(details?.sellable).toBe(false);
    await expect(adapter({ productState: soldOut }).revalidatePrice({ productId: soldOutId, quantity: 1 })).rejects.toMatchObject({ code: "product_unavailable" });
  });

  it("fails closed on cross-store scope instead of leaking another tenant catalog", async () => {
    await expect(adapter({ contextStoreId: otherStoreId }).search("coxinha")).rejects.toBeInstanceOf(CatalogScopeError);
    await expect(adapter({ contextStoreId: otherStoreId }).productDetails(productId)).rejects.toBeInstanceOf(CatalogScopeError);
  });

  it.each([
    ["restaurant", "cardápio", "item", "adicional"],
    ["gas", "catálogo", "produto", "opção de vasilhame"],
    ["generic_commerce", "catálogo", "produto", "opção"],
  ] as const)("projects sellable vocabulary for %s", async (businessType, catalogLabel, itemLabel, optionLabel) => {
    const businessMenu = menu({
      store: { ...menu().store, business_type: businessType },
      businessType,
    });
    const results = await adapter({ menuState: businessMenu, businessType }).search("coxinha");
    expect(results[0]?.projection).toEqual({ businessType, catalogLabel, itemLabel, optionLabel });
  });
});