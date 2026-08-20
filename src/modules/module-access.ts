import {
  MODULE_CATALOG,
  type BusinessType,
  type ModuleDefinition,
  type ModuleKey,
} from "@/modules/module-catalog";

export type ModuleAvailabilityReason =
  | "available"
  | "disabled_by_store"
  | "not_supported_by_profile"
  | "missing_dependency"
  | "not_in_plan"
  | "permission_denied"
  | "temporarily_unavailable";

export type ModuleAvailability = {
  moduleKey: ModuleKey;
  available: boolean;
  reason: ModuleAvailabilityReason;
  missingDependencies: ModuleKey[];
};

export type ResolveModuleAvailabilityInput = {
  definition: ModuleDefinition;
  businessType: BusinessType;
  storeEnabled: boolean;
  activeModuleKeys: ReadonlySet<ModuleKey>;
  grantedPermissions: ReadonlySet<string>;
  entitlementAllowed: boolean;
  temporarilyUnavailable?: boolean;
};

export function resolveModuleAvailability(input: ResolveModuleAvailabilityInput): ModuleAvailability {
  const { definition } = input;
  if (!definition.supportedBusinessTypes.includes(input.businessType)) {
    return { moduleKey: definition.key, available: false, reason: "not_supported_by_profile", missingDependencies: [] };
  }

  if (!input.storeEnabled) {
    return { moduleKey: definition.key, available: false, reason: "disabled_by_store", missingDependencies: [] };
  }

  const missingDependencies = definition.dependencies.filter((key) => !input.activeModuleKeys.has(key));
  if (missingDependencies.length > 0) {
    return { moduleKey: definition.key, available: false, reason: "missing_dependency", missingDependencies };
  }

  if (!input.entitlementAllowed) {
    return { moduleKey: definition.key, available: false, reason: "not_in_plan", missingDependencies: [] };
  }

  if (definition.permissionsAny.length > 0 && !definition.permissionsAny.some((key) => input.grantedPermissions.has(key))) {
    return { moduleKey: definition.key, available: false, reason: "permission_denied", missingDependencies: [] };
  }

  if (input.temporarilyUnavailable) {
    return { moduleKey: definition.key, available: false, reason: "temporarily_unavailable", missingDependencies: [] };
  }

  return { moduleKey: definition.key, available: true, reason: "available", missingDependencies: [] };
}

export function resolveAllModuleAvailability(input: {
  businessType: BusinessType;
  enabledModuleKeys: ReadonlySet<ModuleKey>;
  grantedPermissions: ReadonlySet<string>;
  entitlementAllowedByModule?: ReadonlyMap<ModuleKey, boolean>;
  temporarilyUnavailable?: ReadonlySet<ModuleKey>;
}): Record<ModuleKey, ModuleAvailability> {
  return Object.fromEntries(
    (Object.keys(MODULE_CATALOG) as ModuleKey[]).map((moduleKey) => [
      moduleKey,
      resolveModuleAvailability({
        definition: MODULE_CATALOG[moduleKey],
        businessType: input.businessType,
        storeEnabled: input.enabledModuleKeys.has(moduleKey),
        activeModuleKeys: input.enabledModuleKeys,
        grantedPermissions: input.grantedPermissions,
        entitlementAllowed: input.entitlementAllowedByModule?.get(moduleKey) ?? true,
        temporarilyUnavailable: input.temporarilyUnavailable?.has(moduleKey) ?? false,
      }),
    ]),
  ) as Record<ModuleKey, ModuleAvailability>;
}
