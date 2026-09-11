import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import type { BusinessType } from "@/modules/module-catalog";
import { isOpenAt } from "@/server/menu/schedule";
import { publicMenuSchema, publicProductSchema, type PublicMenu, type PublicProduct } from "@/server/menu/schemas";
import { isPromotionActive, PromotionService } from "@/server/promotions/promotion-service";

export type PublicMenuState = PublicMenu & {
  businessType: BusinessType;
  operational: {
    scheduleOpen: boolean;
    acceptingOrders: boolean;
    canOrder: boolean;
    label: "open" | "closed" | "paused";
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
  hours,
  timeZone,
  now,
}: {
  status: "active" | "temporarily_closed";
  acceptingOrders: boolean;
  hours: PublicMenu["hours"];
  timeZone: string;
  now: Date;
}) {
  const scheduleOpen = status === "active" && isOpenAt(hours, timeZone, now);
  const canOrder = scheduleOpen && acceptingOrders;
  const label = (!acceptingOrders ? "paused" : scheduleOpen ? "open" : "closed") as "open" | "closed" | "paused";
  return { scheduleOpen, acceptingOrders, canOrder, label };
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
      hours: menu.hours,
      timeZone: menu.store.timezone,
      now,
    });

    return { ...menu, businessType, operational };
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
      hours: parsed.hours,
      timeZone: parsed.store.timezone,
      now,
    });
    const gas = businessType === "gas" ? await publicGasOption(parsed.store.id, parsed.product.id) : null;
    return { ...parsed, businessType, gas, operational };
  }
}
