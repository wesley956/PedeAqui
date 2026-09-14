import type { BusinessType } from "@/modules/module-catalog";
import type { GasSaleMode } from "@/server/cart/schemas";
import type { IntelligenceContext } from "@/server/intelligence/context";
import {
  PublicMenuService,
  type PublicMenuState,
  type PublicProductState,
} from "@/server/menu/public-menu-service";
import {
  PricingError,
  PricingService,
  type ModifierSelection,
  type PricingProduct,
} from "@/server/pricing/pricing-service";
import {
  PromotionService,
  type ProductPromotion,
} from "@/server/promotions/promotion-service";

export const INTELLIGENCE_CANONICAL_CATALOG_FLAG = "intelligence_canonical_catalog" as const;
export const INTELLIGENCE_CANONICAL_CATALOG_MODE = "shadow" as const;

export type CatalogProjection = {
  businessType: BusinessType;
  catalogLabel: "cardápio" | "catálogo";
  itemLabel: "item" | "produto";
  optionLabel: "adicional" | "opção" | "opção de vasilhame";
};

export type CatalogSearchResult = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  regularPriceCents: number;
  effectivePriceCents: number;
  promotionLabel: string | null;
  preparationTimeMinutes: number;
  availability: "available";
  projection: CatalogProjection;
};

export type CatalogProductDetails = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  regularPriceCents: number;
  effectivePriceCents: number;
  promotionLabel: string | null;
  preparationTimeMinutes: number;
  availability: "available" | "sold_out";
  sellable: boolean;
  operational: PublicProductState["operational"];
  modifierGroups: Array<{
    id: string;
    name: string;
    description: string | null;
    required: boolean;
    minSelection: number;
    maxSelection: number;
    selectionMode: "distinct_choices" | "quantity_per_option" | "equal_split_options";
    distributionTotal: number | null;
    modifiers: Array<{ id: string; name: string; priceCents: number }>;
  }>;
  gas: PublicProductState["gas"];
  projection: CatalogProjection;
};

export type CatalogAvailability = {
  productId: string;
  availability: "available" | "sold_out";
  sellable: boolean;
  operational: PublicProductState["operational"];
};

export type CatalogPromotion = {
  productId: string;
  productName: string;
  regularPriceCents: number;
  promotionalPriceCents: number;
  label: string | null;
  campaignName: string | null;
};

export type CatalogPriceRevalidationInput = {
  productId: string;
  quantity: number;
  modifierSelections?: ModifierSelection[];
  gasSaleMode?: GasSaleMode | null;
};

export type CatalogPriceRevalidation = {
  productId: string;
  quantity: number;
  regularPriceCents: number;
  effectiveBasePriceCents: number;
  promotionApplied: boolean;
  modifiersUnitPriceCents: number;
  segmentUnitPriceCents: number;
  unitTotalPriceCents: number;
  lineTotalCents: number;
  modifiers: ReturnType<typeof PricingService.priceItem>["modifiers"];
};

export type CatalogAdapterDependencies = {
  getMenu: (slug: string, now?: Date) => Promise<PublicMenuState | null>;
  getProduct: (slug: string, productId: string, now?: Date) => Promise<PublicProductState | null>;
  activePromotions: (storeId: string, timeZone: string, now?: Date) => Promise<ProductPromotion[]>;
};

const defaultDependencies: CatalogAdapterDependencies = {
  getMenu: (slug, now) => PublicMenuService.getMenu(slug, now),
  getProduct: (slug, productId, now) => PublicMenuService.getProduct(slug, productId, now),
  activePromotions: (storeId, timeZone, now) => PromotionService.activeForStore(storeId, timeZone, now),
};

export class CatalogScopeError extends Error {
  constructor(message = "Catalog scope does not match IntelligenceContext") {
    super(message);
    this.name = "CatalogScopeError";
  }
}

function projectionFor(businessType: BusinessType): CatalogProjection {
  if (businessType === "gas") {
    return { businessType: "gas", catalogLabel: "catálogo", itemLabel: "produto", optionLabel: "opção de vasilhame" };
  }
  if (businessType === "generic_commerce") {
    return { businessType: "generic_commerce", catalogLabel: "catálogo", itemLabel: "produto", optionLabel: "opção" };
  }
  return { businessType: "restaurant", catalogLabel: "cardápio", itemLabel: "item", optionLabel: "adicional" };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function searchScore(query: string, name: string, description: string | null, categoryName: string) {
  if (!query) return 1;
  const normalizedName = normalize(name);
  const normalizedDescription = normalize(description ?? "");
  const normalizedCategory = normalize(categoryName);
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 90;
  if (normalizedName.includes(query)) return 80;

  const tokens = query.split(" ").filter(Boolean);
  if (tokens.length > 0 && tokens.every((token) => normalizedName.includes(token))) return 70;
  if (tokens.some((token) => normalizedName.includes(token))) return 60;
  if (normalizedDescription.includes(query)) return 40;
  if (normalizedCategory.includes(query)) return 30;

  if (query.length >= 4 && normalizedName.length >= 4) {
    const distance = editDistance(query, normalizedName);
    const tolerance = Math.max(1, Math.floor(Math.max(query.length, normalizedName.length) * 0.25));
    if (distance <= tolerance) return 50 - distance;
  }
  return 0;
}

function effectivePrice(product: { price_cents: number; promotional_price_cents: number | null }) {
  return product.promotional_price_cents ?? product.price_cents;
}

function assertSafeCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingError("unsafe_total", "Invalid monetary value");
  }
  return value;
}

function toPricingProduct(state: PublicProductState): PricingProduct {
  return {
    id: state.product.id,
    name: state.product.name,
    imageUrl: state.product.image_url,
    priceCents: state.product.price_cents,
    promotionalPriceCents: state.product.promotional_price_cents,
    available: state.product.availability === "available",
    modifierGroups: state.product.modifier_groups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelection: group.min_selection,
      maxSelection: group.max_selection,
      required: group.required,
      selectionMode: group.selection_mode,
      distributionTotal: group.distribution_total,
      modifiers: group.modifiers.map((modifier) => ({
        id: modifier.id,
        groupId: group.id,
        groupName: group.name,
        name: modifier.name,
        priceCents: modifier.price_cents,
      })),
    })),
  };
}

export class IntelligenceCatalogAdapter {
  constructor(
    private readonly context: IntelligenceContext,
    private readonly storeSlug: string,
    private readonly dependencies: CatalogAdapterDependencies = defaultDependencies,
  ) {
    if (!storeSlug.trim()) throw new Error("storeSlug is required");
  }

  private assertScope(storeId: string, businessType: BusinessType) {
    if (storeId !== this.context.storeId || businessType !== this.context.businessType) {
      throw new CatalogScopeError();
    }
  }

  private async menu(now = new Date()) {
    const menu = await this.dependencies.getMenu(this.storeSlug, now);
    if (!menu) return null;
    this.assertScope(menu.store.id, menu.businessType);
    return menu;
  }

  async list(options: { limit?: number; now?: Date } = {}) {
    return this.search("", options);
  }

  async search(query: string, options: { limit?: number; now?: Date } = {}): Promise<CatalogSearchResult[]> {
    const menu = await this.menu(options.now);
    if (!menu) return [];
    const normalizedQuery = normalize(query);
    const projection = projectionFor(menu.businessType);
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

    // PublicMenuService prepends a synthetic promotion category containing duplicated
    // products. Keeping the last occurrence preserves the original canonical category.
    const productsById = new Map<string, {
      category: PublicMenuState["categories"][number];
      product: PublicMenuState["categories"][number]["products"][number];
    }>();
    for (const category of menu.categories) {
      for (const product of category.products) {
        if (product.availability === "available") productsById.set(product.id, { category, product });
      }
    }

    return [...productsById.values()]
      .map(({ category, product }) => ({ category, product, score: searchScore(normalizedQuery, product.name, product.description, category.name) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, "pt-BR"))
      .slice(0, limit)
      .map(({ category, product }) => ({
        id: product.id,
        categoryId: category.id,
        categoryName: category.name,
        name: product.name,
        description: product.description,
        imageUrl: product.image_url,
        regularPriceCents: product.price_cents,
        effectivePriceCents: effectivePrice(product),
        promotionLabel: product.promotion_label,
        preparationTimeMinutes: product.preparation_time_minutes,
        availability: "available" as const,
        projection,
      }));
  }

  async itemDetail(productId: string, now = new Date()) {
    return this.productDetails(productId, now);
  }

  async productDetails(productId: string, now = new Date()): Promise<CatalogProductDetails | null> {
    const state = await this.dependencies.getProduct(this.storeSlug, productId, now);
    if (!state) return null;
    this.assertScope(state.store.id, state.businessType);
    const projection = projectionFor(state.businessType);
    return {
      id: state.product.id,
      name: state.product.name,
      description: state.product.description,
      imageUrl: state.product.image_url,
      regularPriceCents: state.product.price_cents,
      effectivePriceCents: effectivePrice(state.product),
      promotionLabel: state.product.promotion_label,
      preparationTimeMinutes: state.product.preparation_time_minutes,
      availability: state.product.availability,
      sellable: state.product.availability === "available" && state.operational.canOrder,
      operational: state.operational,
      modifierGroups: state.product.modifier_groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        required: group.required,
        minSelection: group.min_selection,
        maxSelection: group.max_selection,
        selectionMode: group.selection_mode,
        distributionTotal: group.distribution_total,
        modifiers: group.modifiers.map((modifier) => ({ id: modifier.id, name: modifier.name, priceCents: modifier.price_cents })),
      })),
      gas: state.gas,
      projection,
    };
  }

  async availability(productId: string, now = new Date()): Promise<CatalogAvailability | null> {
    const details = await this.productDetails(productId, now);
    if (!details) return null;
    return {
      productId: details.id,
      availability: details.availability,
      sellable: details.sellable,
      operational: details.operational,
    };
  }

  async promotions(now = new Date()): Promise<CatalogPromotion[]> {
    const menu = await this.menu(now);
    if (!menu) return [];
    const active = await this.dependencies.activePromotions(menu.store.id, menu.store.timezone, now);
    const products = new Map(
      menu.categories.flatMap((category) => category.products).map((product) => [product.id, product]),
    );
    const cheapest = new Map<string, ProductPromotion>();
    for (const promotion of active) {
      const current = cheapest.get(promotion.product_id);
      if (!current || promotion.promotional_price_cents < current.promotional_price_cents) {
        cheapest.set(promotion.product_id, promotion);
      }
    }
    return [...cheapest.values()].flatMap((promotion) => {
      const product = products.get(promotion.product_id);
      if (!product || product.availability !== "available" || product.promotional_price_cents === null) return [];
      return [{
        productId: product.id,
        productName: product.name,
        regularPriceCents: product.price_cents,
        promotionalPriceCents: product.promotional_price_cents,
        label: product.promotion_label ?? promotion.label,
        campaignName: promotion.campaign_name,
      }];
    });
  }

  async revalidatePrice(input: CatalogPriceRevalidationInput, now = new Date()): Promise<CatalogPriceRevalidation> {
    const state = await this.dependencies.getProduct(this.storeSlug, input.productId, now);
    if (!state) throw new PricingError("product_unavailable", "Produto indisponível");
    this.assertScope(state.store.id, state.businessType);
    if (!state.operational.canOrder) throw new PricingError("store_unavailable", "A loja não está aceitando pedidos agora");
    if (state.product.availability !== "available") throw new PricingError("product_unavailable", "Produto indisponível");

    const gas = state.gas;
    if (input.gasSaleMode && !gas) throw new PricingError("invalid_modifiers", "Opção de vasilhame indisponível");
    if (gas?.requireContainerChoice && !input.gasSaleMode) throw new PricingError("invalid_modifiers", "Escolha troca de vasilhame ou produto com casco");
    if (input.gasSaleMode === "exchange" && !gas?.exchangeEnabled) throw new PricingError("invalid_modifiers", "Troca de vasilhame indisponível");
    if (input.gasSaleMode === "with_container" && !gas?.containerSaleEnabled) throw new PricingError("invalid_modifiers", "Venda com casco indisponível");

    const priced = PricingService.priceItem(toPricingProduct(state), input.modifierSelections ?? [], input.quantity);
    const segmentUnitPriceCents = input.gasSaleMode === "with_container" ? gas?.containerSurchargeCents ?? 0 : 0;
    const unitTotalPriceCents = assertSafeCents(priced.unitTotalPriceCents + segmentUnitPriceCents);
    const lineTotalCents = assertSafeCents(unitTotalPriceCents * input.quantity);

    return {
      productId: state.product.id,
      quantity: input.quantity,
      regularPriceCents: state.product.price_cents,
      effectiveBasePriceCents: priced.baseUnitPriceCents,
      promotionApplied: state.product.promotional_price_cents !== null,
      modifiersUnitPriceCents: priced.modifiersUnitPriceCents,
      segmentUnitPriceCents,
      unitTotalPriceCents,
      lineTotalCents,
      modifiers: priced.modifiers,
    };
  }
}
