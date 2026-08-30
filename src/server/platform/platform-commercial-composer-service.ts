import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CORE_MODULE_KEYS, MODULE_CATALOG, MODULE_KEYS, isBusinessType, isModuleKey, modulesForPreset, type ModuleKey } from "@/modules/module-catalog";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

export type CommercialMode = "package" | "package_plus_addons" | "custom";

type JsonObject = Record<string, unknown>;

function objectMetadata(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function centsMetadata(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export class PlatformCommercialComposerService {
  static async load() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const [organizationsResult, storesResult, plansResult, featuresResult, versionFeaturesResult, subscriptionsResult] = await Promise.all([
      admin.from("organizations").select("id,name,status").eq("status", "active").order("name"),
      admin.from("stores").select("id,organization_id,name,status,business_type,module_config_revision,module_preset").eq("status", "active").order("name"),
      admin.from("plans").select("id,key,name,description,active,monthly_price_cents,currency,current_version_id,metadata").eq("active", true).order("position"),
      admin.from("features").select("id,key,name,active,metadata").eq("active", true).like("key", "module.%").order("key"),
      admin.from("plan_version_features").select("plan_version_id,feature_id,enabled"),
      admin.from("organization_subscriptions").select("id,organization_id,plan_id,status,agreed_price_cents,price_locked,founder_slot,metadata").in("status", ["trialing", "active", "past_due"]),
    ]);
    for (const result of [organizationsResult, storesResult, plansResult, featuresResult, versionFeaturesResult, subscriptionsResult]) {
      if (result.error) throw result.error;
    }

    const storesByOrganization = new Map<string, typeof storesResult.data>();
    for (const store of storesResult.data ?? []) {
      storesByOrganization.set(store.organization_id, [...(storesByOrganization.get(store.organization_id) ?? []), store]);
    }
    const featureById = new Map((featuresResult.data ?? []).map((feature) => [feature.id, feature]));
    const packageModulesByVersion = new Map<string, ModuleKey[]>();
    for (const relation of versionFeaturesResult.data ?? []) {
      if (!relation.enabled) continue;
      const feature = featureById.get(relation.feature_id);
      const moduleKey = feature?.key.startsWith("module.") ? feature.key.slice(7) : "";
      if (!feature || !isModuleKey(moduleKey)) continue;
      packageModulesByVersion.set(relation.plan_version_id, [...(packageModulesByVersion.get(relation.plan_version_id) ?? []), moduleKey]);
    }
    const subscriptionByOrganization = new Map((subscriptionsResult.data ?? []).map((subscription) => [subscription.organization_id, subscription]));

    const organizations = (organizationsResult.data ?? []).map((organization) => {
      const activeStores = storesByOrganization.get(organization.id) ?? [];
      const store = activeStores.length === 1 ? activeStores[0] : null;
      const businessType = store && isBusinessType(store.business_type) ? store.business_type : "restaurant";
      return {
        id: organization.id,
        name: organization.name,
        eligible: activeStores.length === 1,
        eligibilityReason: activeStores.length === 1 ? null : "A composição v1 exige exatamente uma unidade ativa.",
        store: store ? { id: store.id, name: store.name, businessType, moduleRevision: store.module_config_revision, modulePreset: store.module_preset } : null,
        subscription: subscriptionByOrganization.get(organization.id) ?? null,
      };
    });

    const modules = (featuresResult.data ?? []).flatMap((feature) => {
      const moduleKey = feature.key.slice(7);
      if (!isModuleKey(moduleKey)) return [];
      const metadata = objectMetadata(feature.metadata);
      return [{
        key: moduleKey,
        name: feature.name,
        kind: MODULE_CATALOG[moduleKey].kind,
        dependencies: [...MODULE_CATALOG[moduleKey].dependencies],
        sellable: metadata.commercial_sellable === true,
        priceCents: centsMetadata(metadata.commercial_price_cents),
      }];
    });

    const plans = (plansResult.data ?? []).map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      monthlyPriceCents: plan.monthly_price_cents,
      currency: plan.currency,
      currentVersionId: plan.current_version_id,
      includedModules: plan.current_version_id ? (packageModulesByVersion.get(plan.current_version_id) ?? []) : [],
      custom: plan.key === "custom",
    }));

    return { role: access.role, organizations, plans, modules };
  }

  static async apply(input: {
    organizationId: string;
    storeId: string;
    mode: CommercialMode;
    planId: string;
    selectedModules: ModuleKey[];
    modulePrices: Partial<Record<ModuleKey, number>>;
    billingDueDay: number | null;
    nextDueAt: string | null;
    priceLocked: boolean;
    priceLockReason: string | null;
    reason: string;
    protocol: string;
    idempotencyKey: string;
    expectedModuleRevision: number;
  }) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const admin = createAdminClient();

    const [{ data: store, error: storeError }, { data: plan, error: planError }, { data: features, error: featuresError }, { data: planFeatures, error: planFeaturesError }] = await Promise.all([
      admin.from("stores").select("id,organization_id,business_type,module_config_revision,status").eq("id", input.storeId).eq("organization_id", input.organizationId).eq("status", "active").single(),
      admin.from("plans").select("id,key,name,active,monthly_price_cents,current_version_id").eq("id", input.planId).eq("active", true).single(),
      admin.from("features").select("id,key,metadata").eq("active", true).like("key", "module.%"),
      admin.from("plan_version_features").select("plan_version_id,feature_id,enabled"),
    ]);
    if (storeError) throw storeError;
    if (planError) throw planError;
    if (featuresError) throw featuresError;
    if (planFeaturesError) throw planFeaturesError;
    if (!plan.current_version_id) throw new Error("Plano sem versão comercial ativa");
    if (!isBusinessType(store.business_type)) throw new Error("Tipo de negócio inválido");
    if (store.module_config_revision !== input.expectedModuleRevision) throw new Error("A configuração de módulos mudou; recarregue antes de aplicar.");

    const featureById = new Map((features ?? []).map((feature) => [feature.id, feature]));
    const includedModules = (planFeatures ?? []).flatMap((relation) => {
      if (!relation.enabled || relation.plan_version_id !== plan.current_version_id) return [];
      const key = featureById.get(relation.feature_id)?.key?.slice(7) ?? "";
      return isModuleKey(key) ? [key] : [];
    });

    const requested = input.selectedModules.filter(isModuleKey);
    const targetModules = input.mode === "package"
      ? modulesForPreset(store.business_type, "custom", includedModules)
      : input.mode === "package_plus_addons"
        ? modulesForPreset(store.business_type, "custom", [...includedModules, ...requested])
        : modulesForPreset(store.business_type, "custom", requested);

    const core = new Set<ModuleKey>(CORE_MODULE_KEYS.filter((key) => MODULE_CATALOG[key].supportedBusinessTypes.includes(store.business_type)));
    const packageBase = new Set(includedModules);
    const featureByModule = new Map<ModuleKey, { metadata: JsonObject }>();
    for (const feature of features ?? []) {
      const key = feature.key.slice(7);
      if (isModuleKey(key)) featureByModule.set(key, { metadata: objectMetadata(feature.metadata) });
    }

    const moduleItems = targetModules.map((moduleKey) => {
      const includedInBase = input.mode === "custom" ? core.has(moduleKey) : packageBase.has(moduleKey);
      const metadata = featureByModule.get(moduleKey)?.metadata ?? {};
      const defaultPrice = centsMetadata(metadata.commercial_price_cents) ?? 0;
      const requestedPrice = input.modulePrices[moduleKey];
      const priceCents = includedInBase ? 0 : (requestedPrice ?? defaultPrice);
      if (!includedInBase && metadata.commercial_sellable !== true) throw new Error(`O módulo ${moduleKey} não está liberado para venda avulsa.`);
      if (!includedInBase && priceCents < 1) throw new Error(`Defina um preço para o módulo ${moduleKey}.`);
      return { module_key: moduleKey, enabled: true, included_in_base: includedInBase, price_cents: priceCents };
    });

    const basePriceCents = plan.monthly_price_cents ?? 0;
    const { data, error } = await admin.rpc("platform_commercial_composition_apply_internal", {
      p_organization_id: input.organizationId,
      p_store_id: input.storeId,
      p_mode: input.mode,
      p_plan_id: input.planId,
      p_base_price_cents: basePriceCents,
      p_module_items: moduleItems,
      p_billing_due_day: input.billingDueDay,
      p_next_due_at: input.nextDueAt,
      p_payment_status: input.nextDueAt ? "pending" : "not_started",
      p_price_locked: input.priceLocked,
      p_price_lock_reason: input.priceLocked ? input.priceLockReason : null,
      p_actor_user_id: access.user.id,
      p_reason: input.reason,
      p_protocol: input.protocol,
      p_idempotency_key: input.idempotencyKey,
      p_expected_module_revision: input.expectedModuleRevision,
    });
    if (error) throw error;
    return data;
  }

  static moduleKeysFromForm(values: string[]) {
    return values.filter(isModuleKey);
  }
}
