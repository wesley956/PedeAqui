import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModuleAvailability, type ModuleAvailability } from "@/modules/module-access";
import {
  MODULE_CATALOG,
  MODULE_KEYS,
  isBusinessType,
  isModuleKey,
  isModulePreset,
  modulesForPreset,
  type BusinessType,
  type ModuleKey,
} from "@/modules/module-catalog";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";

const AUTOMATION_MODULES = ["conversations", "production", "deliveries"] as const;
type AutomationModuleKey = (typeof AUTOMATION_MODULES)[number];

export type WhatsAppAutomationStructuralSnapshot = {
  businessType: BusinessType;
  modules: Pick<Record<ModuleKey, ModuleAvailability>, AutomationModuleKey>;
  onlinePaymentReady: boolean;
  deliveryOperationEnabled: boolean;
};

function entitlementFeatureKey(moduleKey: ModuleKey) {
  return MODULE_CATALOG[moduleKey].entitlementFeatureKey ?? `module.${moduleKey}`;
}

async function structuralModules(organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const [{ data: store, error: storeError }, { data: moduleRows, error: moduleError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
    admin.from("stores")
      .select("business_type, module_preset")
      .eq("organization_id", organizationId)
      .eq("id", storeId)
      .single(),
    admin.from("store_modules")
      .select("module_key, enabled")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId),
    admin.from("organization_subscriptions")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1),
  ]);
  if (storeError) throw storeError;
  if (moduleError) throw moduleError;
  if (subscriptionError) throw subscriptionError;

  const rawBusinessType = String(store.business_type ?? "restaurant");
  const businessType: BusinessType = isBusinessType(rawBusinessType) ? rawBusinessType : "restaurant";
  const rawPreset = String(store.module_preset ?? "complete");
  const preset = isModulePreset(rawPreset) ? rawPreset : "complete";
  const explicit = new Map<ModuleKey, boolean>();
  for (const row of moduleRows ?? []) {
    const key = String(row.module_key ?? "");
    if (isModuleKey(key)) explicit.set(key, row.enabled === true);
  }

  const presetFallback = new Set(modulesForPreset(businessType, preset));
  const enabledModuleKeys = new Set<ModuleKey>();
  for (const key of MODULE_KEYS) {
    if (explicit.has(key)) {
      if (explicit.get(key)) enabledModuleKeys.add(key);
    } else if (businessType === "restaurant" || presetFallback.has(key)) {
      enabledModuleKeys.add(key);
    }
  }

  const entitlements = new Map<AutomationModuleKey, boolean>();
  if (!subscriptions?.length) {
    for (const moduleKey of AUTOMATION_MODULES) entitlements.set(moduleKey, true);
  } else {
    await Promise.all(AUTOMATION_MODULES.map(async (moduleKey) => {
      const { data, error } = await admin.rpc("organization_entitlement_internal", {
        p_organization_id: organizationId,
        p_feature_key: entitlementFeatureKey(moduleKey),
        p_at: new Date().toISOString(),
      });
      if (error) throw error;
      entitlements.set(moduleKey, Boolean((data as { enabled?: boolean } | null)?.enabled));
    }));
  }

  const modules = Object.fromEntries(AUTOMATION_MODULES.map((moduleKey) => {
    const definition = MODULE_CATALOG[moduleKey];
    return [moduleKey, resolveModuleAvailability({
      definition,
      businessType,
      storeEnabled: enabledModuleKeys.has(moduleKey),
      activeModuleKeys: enabledModuleKeys,
      grantedPermissions: new Set(definition.permissionsAny),
      entitlementAllowed: entitlements.get(moduleKey) ?? true,
    })];
  })) as Pick<Record<ModuleKey, ModuleAvailability>, AutomationModuleKey>;

  return { businessType, modules };
}

export class WhatsAppAutomationCapabilityService {
  static async loadCurrentStore(): Promise<WhatsAppAutomationStructuralSnapshot> {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    if (!context.storeId) throw new Error("Selecione uma unidade para configurar as automações do WhatsApp.");
    return this.loadForStore(context.organizationId, context.storeId);
  }

  static async loadForStore(organizationId: string, storeId: string): Promise<WhatsAppAutomationStructuralSnapshot> {
    const admin = createAdminClient();
    const [moduleSnapshot, onlinePaymentReady, deliverySettings] = await Promise.all([
      structuralModules(organizationId, storeId),
      OrderPaymentProviderConfigService.isOnlinePixReady(organizationId, storeId),
      admin.from("store_delivery_settings")
        .select("enabled")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);
    if (deliverySettings.error) throw deliverySettings.error;

    return {
      ...moduleSnapshot,
      onlinePaymentReady,
      deliveryOperationEnabled: deliverySettings.data?.enabled ?? true,
    };
  }
}
