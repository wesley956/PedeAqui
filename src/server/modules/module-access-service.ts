import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  MODULE_CATALOG,
  MODULE_KEYS,
  modulesForPreset,
  isBusinessType,
  isModuleKey,
  isModulePreset,
  type BusinessType,
  type ModuleKey,
  type ModulePreset,
} from "@/modules/module-catalog";
import { resolveAllModuleAvailability, type ModuleAvailability } from "@/modules/module-access";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import { PermissionSnapshotService } from "@/server/access/permission-snapshot-service";

export type StoreModuleSnapshot = {
  context: AccessContext;
  businessType: BusinessType;
  preset: ModulePreset;
  catalogVersion: number;
  configRevision: number;
  roleKeys: string[];
  permissionKeys: string[];
  enabledModuleKeys: Set<ModuleKey>;
  entitlementAllowedByModule: Map<ModuleKey, boolean>;
  availability: Record<ModuleKey, ModuleAvailability>;
};

export class ModuleUnavailableError extends Error {
  constructor(public readonly moduleKey: ModuleKey, public readonly reason: ModuleAvailability["reason"]) {
    super(`Module unavailable: ${moduleKey} (${reason})`);
    this.name = "ModuleUnavailableError";
  }
}

async function entitlementMap(organizationId: string) {
  const result = new Map<ModuleKey, boolean>();
  const featureToModules = new Map<string, ModuleKey[]>();

  for (const moduleKey of MODULE_KEYS) {
    const featureKey = MODULE_CATALOG[moduleKey].entitlementFeatureKey;
    if (!featureKey) { result.set(moduleKey, true); continue; }
    featureToModules.set(featureKey, [...(featureToModules.get(featureKey) ?? []), moduleKey]);
  }

  if (featureToModules.size === 0) return result;
  const admin = createAdminClient();
  await Promise.all([...featureToModules.entries()].map(async ([featureKey, moduleKeys]) => {
    const { data, error } = await admin.rpc("organization_entitlement_internal", {
      p_organization_id: organizationId,
      p_feature_key: featureKey,
      p_at: new Date().toISOString(),
    });
    if (error) throw error;
    const allowed = Boolean((data as { enabled?: boolean } | null)?.enabled);
    for (const moduleKey of moduleKeys) result.set(moduleKey, allowed);
  }));
  return result;
}

const loadStoreModuleRows = cache(async (organizationId: string, storeId: string) => {
  const supabase = await createClient();
  const [{ data: store, error: storeError }, { data: rows, error: rowsError }] = await Promise.all([
    supabase
      .from("stores")
      .select("business_type, module_preset, module_catalog_version, module_config_revision")
      .eq("organization_id", organizationId)
      .eq("id", storeId)
      .single(),
    supabase
      .from("store_modules")
      .select("module_key, enabled")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId),
  ]);
  if (storeError) throw storeError;
  if (rowsError) throw rowsError;
  return { store, rows: rows ?? [] };
});

export class ModuleAccessService {
  static async load(existingContext?: AccessContext): Promise<StoreModuleSnapshot> {
    const context = existingContext ?? (await getAccessContext());
    if (!context.storeId) throw new Error("Module access requires an active store");

    const [{ store, rows }, permissionSnapshot, entitlements] = await Promise.all([
      loadStoreModuleRows(context.organizationId, context.storeId),
      PermissionSnapshotService.load(context),
      entitlementMap(context.organizationId),
    ]);

    const rawBusinessType = String(store.business_type ?? "restaurant");
    const businessType: BusinessType = isBusinessType(rawBusinessType) ? rawBusinessType : "restaurant";
    const rawPreset = String(store.module_preset ?? "complete");
    const preset: ModulePreset = isModulePreset(rawPreset) ? rawPreset : "complete";
    const catalogVersion = Number(store.module_catalog_version) || 1;
    const configRevision = Number(store.module_config_revision) || 0;
    const explicit = new Map<ModuleKey, boolean>();
    for (const row of rows) {
      const key = String(row.module_key ?? "");
      if (isModuleKey(key)) explicit.set(key, row.enabled === true);
    }

    const presetFallback = new Set(modulesForPreset(businessType, preset));
    const enabledModuleKeys = new Set<ModuleKey>();
    for (const key of MODULE_KEYS) {
      if (explicit.has(key)) {
        if (explicit.get(key)) enabledModuleKeys.add(key);
      } else if (businessType === "restaurant" || presetFallback.has(key)) {
        // Backward-compatible fallback: a legacy restaurant with a missing row must
        // never lose an existing surface during the modular rollout.
        enabledModuleKeys.add(key);
      }
    }

    const availability = resolveAllModuleAvailability({
      businessType,
      enabledModuleKeys,
      grantedPermissions: new Set(permissionSnapshot.permissionKeys),
      entitlementAllowedByModule: entitlements,
    });

    return {
      context,
      businessType,
      preset,
      catalogVersion,
      configRevision,
      roleKeys: permissionSnapshot.roleKeys,
      permissionKeys: permissionSnapshot.permissionKeys,
      enabledModuleKeys,
      entitlementAllowedByModule: entitlements,
      availability,
    };
  }

  static async inspect(moduleKey: ModuleKey, existingContext?: AccessContext) {
    const snapshot = await this.load(existingContext);
    return { snapshot, module: snapshot.availability[moduleKey] };
  }

  static async require(moduleKey: ModuleKey, existingContext?: AccessContext) {
    const result = await this.inspect(moduleKey, existingContext);
    if (!result.module.available) throw new ModuleUnavailableError(moduleKey, result.module.reason);
    return result.snapshot;
  }
}
