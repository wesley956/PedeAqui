import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isBusinessType,
  isModulePreset,
  modulesForPreset,
  type ModuleKey,
} from "@/modules/module-catalog";

export class StoreModuleStateService {
  static async isEnabled(organizationId: string, storeId: string, moduleKey: ModuleKey) {
    const admin = createAdminClient();
    const [storeResult, moduleResult] = await Promise.all([
      admin
        .from("stores")
        .select("business_type,module_preset")
        .eq("organization_id", organizationId)
        .eq("id", storeId)
        .maybeSingle(),
      admin
        .from("store_modules")
        .select("enabled")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("module_key", moduleKey)
        .maybeSingle(),
    ]);

    if (storeResult.error) throw storeResult.error;
    if (moduleResult.error) throw moduleResult.error;
    if (!storeResult.data) return false;
    if (moduleResult.data) return moduleResult.data.enabled === true;

    const rawBusinessType = String(storeResult.data.business_type ?? "restaurant");
    const businessType = isBusinessType(rawBusinessType) ? rawBusinessType : "restaurant";
    if (businessType === "restaurant") return true;

    const rawPreset = String(storeResult.data.module_preset ?? "complete");
    const preset = isModulePreset(rawPreset) ? rawPreset : "complete";
    return modulesForPreset(businessType, preset).includes(moduleKey);
  }
}
