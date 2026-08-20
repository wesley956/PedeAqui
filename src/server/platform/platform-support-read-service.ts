import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG, MODULE_KEYS, isBusinessType, moduleLabel, profileSupportsModule } from "@/modules/module-catalog";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export class PlatformSupportReadService {
  static async load(organizationId: string, storeId: string) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") return { role: access.role, config: null } as const;
    const admin = createAdminClient();
    const [store, menu, hours, delivery, payments, moduleRows] = await Promise.all([
      admin.from("stores").select("status,business_type,module_preset,module_catalog_version,module_config_revision").eq("organization_id", organizationId).eq("id", storeId).maybeSingle(),
      admin.from("store_menu_settings").select("active,accepting_orders,allow_delivery,allow_pickup,pause_reason").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("store_hours").select("id,weekday,opens_at,closes_at,closes_next_day,active").eq("organization_id", organizationId).eq("store_id", storeId).order("weekday").order("sort_order"),
      admin.from("store_delivery_settings").select("enabled,fee_mode,default_fee_cents,estimated_min_minutes,estimated_max_minutes,require_neighborhood_match").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("store_payment_methods").select("method,enabled,sort_order").eq("organization_id", organizationId).eq("store_id", storeId).order("sort_order"),
      admin.from("store_modules").select("module_key,enabled,configuration_source,catalog_version").eq("organization_id", organizationId).eq("store_id", storeId),
    ]);
    for (const result of [store, menu, hours, delivery, payments, moduleRows]) if (result.error) throw result.error;
    if (!store.data) throw new Error("Unidade não encontrada para a empresa selecionada.");

    const rawBusinessType = String(store.data.business_type ?? "restaurant");
    const businessType = isBusinessType(rawBusinessType) ? rawBusinessType : "restaurant";
    const explicit = new Map((moduleRows.data ?? []).map((row) => [String(row.module_key), row.enabled === true]));
    const entitlements = new Map<string, boolean>();
    await Promise.all(MODULE_KEYS.map(async (key) => {
      const featureKey = MODULE_CATALOG[key].entitlementFeatureKey;
      if (!featureKey) { entitlements.set(key, true); return; }
      const { data, error } = await admin.rpc("organization_entitlement_internal", { p_organization_id: organizationId, p_feature_key: featureKey, p_at: new Date().toISOString() });
      if (error) throw error;
      entitlements.set(key, Boolean((data as { enabled?: boolean } | null)?.enabled));
    }));
    const modules = MODULE_KEYS.filter((key) => profileSupportsModule(businessType, key)).map((key) => ({
      key,
      label: moduleLabel(key, businessType),
      enabled: explicit.get(key) ?? (businessType === "restaurant"),
      entitled: entitlements.get(key) !== false,
      canDisable: MODULE_CATALOG[key].canDisable,
      kind: MODULE_CATALOG[key].kind,
    }));

    return {
      role: access.role,
      config: {
        storeStatus: store.data.status,
        businessType,
        modulePreset: String(store.data.module_preset ?? "complete"),
        moduleCatalogVersion: Number(store.data.module_catalog_version) || 1,
        moduleConfigRevision: Number(store.data.module_config_revision) || 0,
        modules,
        menu: menu.data ?? null,
        hours: hours.data ?? [],
        delivery: delivery.data ?? null,
        payments: payments.data ?? [],
      },
    } as const;
  }
}
