import { isModuleKey, type ModuleKey } from "@/modules/module-catalog";

const MODULE_FEATURE_PREFIX = "module.";

export function moduleKeyFromEntitlementFeatureKey(featureKey: string | null | undefined): ModuleKey | null {
  if (!featureKey) return null;
  const normalized = featureKey.startsWith(MODULE_FEATURE_PREFIX)
    ? featureKey.slice(MODULE_FEATURE_PREFIX.length)
    : featureKey;
  return isModuleKey(normalized) ? normalized : null;
}
