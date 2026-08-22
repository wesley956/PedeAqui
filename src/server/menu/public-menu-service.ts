import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import type { BusinessType } from "@/modules/module-catalog";
import { isOpenAt } from "@/server/menu/schedule";
import { publicMenuSchema, publicProductSchema, type PublicMenu, type PublicProduct } from "@/server/menu/schemas";

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

    const menu = publicMenuSchema.parse(data);
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
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_public_product", {
      p_store_slug: slug,
      p_product_id: productId,
    });
    if (error) throw error;
    if (!data) return null;
    const parsed = publicProductSchema.parse(data);
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
