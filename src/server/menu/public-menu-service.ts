import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import type { BusinessType } from "@/modules/module-catalog";
import { resolveStoreOperationalStatus } from "@/server/menu/store-operational-status";
import { publicMenuSchema, publicProductSchema, type PublicMenu, type PublicProduct } from "@/server/menu/schemas";
import { isPromotionActive, PromotionService } from "@/server/promotions/promotion-service";

export type PublicProductOptionsSummary = {
  /** O produto tem grupos de opções ativos: abre a tela do produto em vez de adicionar direto. */
  hasOptions: boolean;
  /** Menor acréscimo obrigatório (centavos). Quando maior que zero, o cardápio mostra "a partir de". */
  minimumRequiredExtraCents: number;
  /** O produto tem opções com preços diferentes, então o valor final pode subir. */
  priceVaries: boolean;
};

export type PublicMenuState = PublicMenu & {
  businessType: BusinessType;
  /** Resumo das opções por produto. Produto ausente = tratar como "tem opções". */
  productOptions?: Record<string, PublicProductOptionsSummary>;
  operational: {
    scheduleOpen: boolean;
    acceptingOrders: boolean;
    canOrder: boolean;
    label: "open" | "closed" | "paused";
    nextOpening?: import("@/server/menu/schedule").NextOpening | null;
    pauseReason?: string | null;
  };
};

export type PublicGasProductOption = {
  containerCode: string;
  containerName: string;
  exchangeEnabled: boolean;
  containerSaleEnabled: boolean;
  requireContainerChoice: boolean;
  containerSurchargeCents: number;
};

export type PublicProductState = PublicProduct & {
  businessType: BusinessType;
  gas: PublicGasProductOption | null;
  operational: PublicMenuState["operational"];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROMOTIONS_CATEGORY_ID = "00000000-0000-4000-8000-000000000999";

function operationalState({
  status,
  acceptingOrders,
  pauseReason,
  allowDelivery,
  allowPickup,
  hours,
  timeZone,
  now,
}: {
  status: "active" | "temporarily_closed";
  acceptingOrders: boolean;
  pauseReason?: string | null;
  allowDelivery?: boolean;
  allowPickup?: boolean;
  hours: PublicMenu["hours"];
  timeZone: string;
  now: Date;
}) {
  const resolved = resolveStoreOperationalStatus({
    storeStatus: status,
    acceptingOrders,
    pauseReason,
    allowDelivery,
    allowPickup,
    hours,
    timeZone,
    now,
  });
  return {
    scheduleOpen: resolved.scheduleOpen,
    acceptingOrders: resolved.acceptingOrders,
    canOrder: resolved.canOrder,
    label: resolved.label,
    nextOpening: resolved.nextOpening,
    pauseReason: resolved.pauseReason,
  };
}

async function applyScheduledPromotions(menu: PublicMenu, now: Date): Promise<PublicMenu> {
  const schedules = await PromotionService.schedulesForStore(menu.store.id);
  if (schedules.length === 0) return menu;

  const byProduct = new Map<string, typeof schedules>();
  for (const promotion of schedules) {
    byProduct.set(promotion.product_id, [...(byProduct.get(promotion.product_id) ?? []), promotion]);
  }

  const promotedProducts: PublicMenu["categories"][number]["products"] = [];
  const seen = new Set<string>();
  const categories = menu.categories.map((category) => ({
    ...category,
    products: category.products.map((product) => {
      const productSchedules = byProduct.get(product.id) ?? [];
      if (productSchedules.length === 0) return product;

      const activeSchedule = productSchedules
        .filter((schedule) => isPromotionActive(schedule, menu.store.timezone, now) && schedule.promotional_price_cents < product.price_cents)
        .sort((a, b) => a.promotional_price_cents - b.promotional_price_cents)[0] ?? null;

      if (!activeSchedule) {
        return { ...product, promotional_price_cents: null, promotion_label: null };
      }

      const decorated = {
        ...product,
        promotional_price_cents: activeSchedule.promotional_price_cents,
        promotion_label: activeSchedule.label ?? activeSchedule.campaign_name,
      };
      if (product.availability === "available" && !seen.has(product.id)) {
        seen.add(product.id);
        promotedProducts.push(decorated);
      }
      return decorated;
    }),
  }));

  if (promotedProducts.length === 0) return { ...menu, categories };
  return {
    ...menu,
    categories: [{
      id: PROMOTIONS_CATEGORY_ID,
      name: "🔥 Promoções",
      description: "Ofertas ativas agora",
      image_url: null,
      products: promotedProducts,
    }, ...categories],
  };
}

async function applyScheduledPromotionToProduct(productState: PublicProduct, now: Date): Promise<PublicProduct> {
  const effective = await PromotionService.effectiveForProduct(productState.store.id, productState.product.id, productState.store.timezone, now);
  if (!effective.hasSchedule) return productState;
  const promotion = effective.promotion;
  const active = promotion && promotion.promotional_price_cents < productState.product.price_cents;
  return {
    ...productState,
    product: {
      ...productState.product,
      promotional_price_cents: active ? promotion.promotional_price_cents : null,
      promotion_label: active ? (promotion.label ?? promotion.campaign_name) : null,
    },
  };
}

async function publicGasOption(organizationStoreId: string, productId: string): Promise<PublicGasProductOption | null> {
  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin.from("stores").select("id,organization_id,business_type").eq("id", organizationStoreId).maybeSingle();
  if (storeError) throw storeError;
  if (!store || store.business_type !== "gas") return null;

  const [{ data: moduleRow, error: moduleError }, { data: entitlement, error: entitlementError }] = await Promise.all([
    admin.from("store_modules").select("enabled").eq("organization_id", store.organization_id).eq("store_id", store.id).eq("module_key", "gas_containers").maybeSingle(),
    admin.rpc("organization_entitlement_internal", { p_organization_id: store.organization_id, p_feature_key: "module.gas_containers" }),
  ]);
  if (moduleError) throw moduleError;
  if (entitlementError) throw entitlementError;
  if (!moduleRow?.enabled || !(entitlement as { enabled?: boolean } | null)?.enabled) return null;

  const { data: profile, error: profileError } = await admin.from("product_gas_profiles")
    .select("container_type_id,exchange_enabled,container_sale_enabled,require_container_choice,container_surcharge_cents,active")
    .eq("organization_id", store.organization_id).eq("store_id", store.id).eq("product_id", productId).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.active) return null;
  const { data: container, error: containerError } = await admin.from("gas_container_types")
    .select("code,name,active").eq("organization_id", store.organization_id).eq("store_id", store.id).eq("id", profile.container_type_id).maybeSingle();
  if (containerError) throw containerError;
  if (!container?.active) return null;
  return {
    containerCode: container.code,
    containerName: container.name,
    exchangeEnabled: Boolean(profile.exchange_enabled),
    containerSaleEnabled: Boolean(profile.container_sale_enabled),
    requireContainerChoice: Boolean(profile.require_container_choice),
    containerSurchargeCents: Number(profile.container_surcharge_cents ?? 0),
  };
}

type OptionGroupRow = {
  product_id: string;
  modifier_groups: {
    min_selection: number;
    required: boolean;
    active: boolean;
    deleted_at: string | null;
    selection_mode?: string | null;
    modifiers: Array<{ price_cents: number; active: boolean; deleted_at: string | null }> | null;
  } | null;
};

export function summarizeProductOptions(productIds: string[], rows: OptionGroupRow[]) {
  const summary: Record<string, PublicProductOptionsSummary> = {};
  for (const id of productIds) summary[id] = { hasOptions: false, minimumRequiredExtraCents: 0, priceVaries: false };
  for (const row of rows) {
    const group = row.modifier_groups;
    const target = summary[row.product_id];
    if (!target || !group || !group.active || group.deleted_at) continue;
    const prices = (group.modifiers ?? []).filter((modifier) => modifier.active && !modifier.deleted_at).map((modifier) => Number(modifier.price_cents ?? 0));
    if (prices.length === 0) continue;
    target.hasOptions = true;
    if (prices.some((price) => price > 0)) target.priceVaries = true;
    const minimum = group.required ? Math.max(1, Number(group.min_selection ?? 0)) : Number(group.min_selection ?? 0);
    // Só o modo de escolhas distintas tem acréscimo mínimo previsível; nos demais o piso fica no preço base.
    if (minimum > 0 && (group.selection_mode ?? "distinct_choices") === "distinct_choices") {
      const cheapest = [...prices].sort((a, b) => a - b).slice(0, minimum);
      if (cheapest.length === minimum) target.minimumRequiredExtraCents += cheapest.reduce((sum, price) => sum + price, 0);
    }
  }
  return summary;
}

async function loadProductOptions(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return {};
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("product_modifier_groups")
      .select("product_id, modifier_groups(min_selection, required, active, deleted_at, selection_mode, modifiers(price_cents, active, deleted_at))")
      .eq("store_id", storeId)
      .in("product_id", productIds);
    if (error) throw error;
    return summarizeProductOptions(productIds, (data ?? []) as unknown as OptionGroupRow[]);
  } catch {
    // Sem o resumo, todo produto abre a própria tela: nunca adiciona algo incompleto.
    return {};
  }
}

export class PublicMenuService {
  static async getMenu(slug: string, now = new Date()): Promise<PublicMenuState | null> {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_public_menu", { p_store_slug: slug });
    if (error) throw error;
    if (!data) return null;

    const parsed = publicMenuSchema.parse(data);
    const menu = await applyScheduledPromotions(parsed, now);
    const businessType = menu.store.business_type;
    const operational = operationalState({
      status: menu.store.status,
      acceptingOrders: menu.settings.accepting_orders,
      pauseReason: menu.settings.pause_reason,
      allowDelivery: menu.settings.allow_delivery,
      allowPickup: menu.settings.allow_pickup,
      hours: menu.hours,
      timeZone: menu.store.timezone,
      now,
    });

    const productIds = [...new Set(menu.categories.flatMap((category) => category.products.map((product) => product.id)))];
    const productOptions = await loadProductOptions(menu.store.id, productIds);
    return { ...menu, businessType, operational, productOptions };
  }

  static async getProduct(slug: string, productId: string, now = new Date()): Promise<PublicProductState | null> {
    if (!UUID_PATTERN.test(productId)) return null;
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_public_product", {
      p_store_slug: slug,
      p_product_id: productId,
    });
    if (error) throw error;
    if (!data) return null;
    const parsed = await applyScheduledPromotionToProduct(publicProductSchema.parse(data), now);
    const businessType = parsed.store.business_type;
    const operational = operationalState({
      status: parsed.store.status,
      acceptingOrders: parsed.settings.accepting_orders,
      pauseReason: parsed.settings.pause_reason,
      hours: parsed.hours,
      timeZone: parsed.store.timezone,
      now,
    });
    const gas = businessType === "gas" ? await publicGasOption(parsed.store.id, parsed.product.id) : null;
    return { ...parsed, businessType, gas, operational };
  }
}
