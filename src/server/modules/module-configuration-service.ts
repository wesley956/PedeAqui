import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_KEYS, modulesForPreset, type ModuleKey, type ModulePreset } from "@/modules/module-catalog";
import { planModuleChange, type ModuleLifecyclePlan } from "@/modules/module-lifecycle";
import { authorize } from "@/server/access/authorize";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import { PERMISSIONS } from "@/server/access/permissions";
import { ModuleAccessService, type StoreModuleSnapshot } from "@/server/modules/module-access-service";

export class ModuleConfigurationError extends Error {
  constructor(public readonly plan: ModuleLifecyclePlan) {
    super(`Module configuration is blocked: ${plan.requestedModuleKey}`);
    this.name = "ModuleConfigurationError";
  }
}

export class ModulePresetConfigurationError extends Error {
  constructor(public readonly blockers: Array<{ code: "not_in_plan" | "operational_blocker"; moduleKey: ModuleKey; detail?: string }>) {
    super("Module preset configuration is blocked");
    this.name = "ModulePresetConfigurationError";
  }
}

export class ModuleConfigurationConflictError extends Error {
  constructor() {
    super("Module configuration changed concurrently; reload and retry");
    this.name = "ModuleConfigurationConflictError";
  }
}

export type ModuleConfigurationPreview = { context: AccessContext; snapshot: StoreModuleSnapshot; plan: ModuleLifecyclePlan };

async function operationalBlockers(organizationId: string, storeId: string, moduleKey: ModuleKey): Promise<string[]> {
  const admin = createAdminClient();
  if (moduleKey === "cash") {
    const { data, error } = await admin.from("cash_sessions").select("id").eq("organization_id", organizationId).eq("store_id", storeId).eq("status", "open").limit(1);
    if (error) throw error;
    return data?.length ? ["cash_session_open"] : [];
  }
  if (moduleKey === "dining") {
    const { data, error } = await admin.from("tabs").select("id").eq("organization_id", organizationId).eq("store_id", storeId).in("status", ["open", "settling"]).limit(1);
    if (error) throw error;
    return data?.length ? ["dining_tab_open"] : [];
  }
  if (moduleKey === "deliveries" || moduleKey === "driver") {
    const { data, error } = await admin.from("deliveries").select("id").eq("organization_id", organizationId).eq("store_id", storeId).is("delivered_at", null).is("canceled_at", null).limit(1);
    if (error) throw error;
    return data?.length ? ["delivery_in_progress"] : [];
  }
  return [];
}

async function authorizedSnapshot(existingContext?: AccessContext) {
  const rawContext = existingContext ?? (await getAccessContext());
  const context = await authorize(PERMISSIONS.STORES_MANAGE, rawContext);
  if (!context.storeId) throw new Error("Module configuration requires an active store");
  const snapshot = await ModuleAccessService.load(context);
  return { context, snapshot };
}

export class ModuleConfigurationService {
  static async preview(input: { moduleKey: ModuleKey; enabled: boolean; existingContext?: AccessContext }): Promise<ModuleConfigurationPreview> {
    const { context, snapshot } = await authorizedSnapshot(input.existingContext);
    if (!context.storeId) throw new Error("Module configuration requires an active store");
    const blockedByPlan = new Set<ModuleKey>();
    for (const [moduleKey, allowed] of snapshot.entitlementAllowedByModule) if (!allowed) blockedByPlan.add(moduleKey);
    const blockers = input.enabled ? [] : await operationalBlockers(context.organizationId, context.storeId, input.moduleKey);
    const plan = planModuleChange({ moduleKey: input.moduleKey, enabled: input.enabled, businessType: snapshot.businessType, enabledModuleKeys: snapshot.enabledModuleKeys, modulesBlockedByPlan: blockedByPlan, operationalBlockers: blockers });
    return { context, snapshot, plan };
  }

  static async apply(input: { moduleKey: ModuleKey; enabled: boolean; source?: "manual" | "preset" | "support"; existingContext?: AccessContext }) {
    const preview = await this.preview(input);
    if (preview.plan.status === "blocked") throw new ModuleConfigurationError(preview.plan);
    if (preview.plan.changes.length === 0) return { ...preview, changed: false };
    if (!preview.context.storeId) throw new Error("Module configuration requires an active store");
    const admin = createAdminClient();
    const { error } = await admin.rpc("set_store_modules_internal", {
      p_organization_id: preview.context.organizationId,
      p_store_id: preview.context.storeId,
      p_changes: preview.plan.changes.map((change) => ({ module_key: change.moduleKey, enabled: change.enabled })),
      p_source: input.source ?? "manual",
      p_actor_user_id: preview.context.userId,
      p_expected_revision: preview.snapshot.configRevision,
    });
    if (error) {
      if (/module configuration revision conflict/i.test(error.message ?? "")) throw new ModuleConfigurationConflictError();
      throw error;
    }
    return { ...preview, changed: true };
  }

  static async previewPreset(input: { preset: Exclude<ModulePreset, "custom">; existingContext?: AccessContext }) {
    const { context, snapshot } = await authorizedSnapshot(input.existingContext);
    if (!context.storeId) throw new Error("Module configuration requires an active store");
    const target = new Set(modulesForPreset(snapshot.businessType, input.preset));
    const changes = MODULE_KEYS.filter((key) => snapshot.enabledModuleKeys.has(key) !== target.has(key)).map((moduleKey) => ({ moduleKey, enabled: target.has(moduleKey) }));
    const blockers: Array<{ code: "not_in_plan" | "operational_blocker"; moduleKey: ModuleKey; detail?: string }> = [];
    for (const key of target) if (snapshot.entitlementAllowedByModule.get(key) === false) blockers.push({ code: "not_in_plan", moduleKey: key });
    for (const change of changes.filter((entry) => !entry.enabled)) {
      for (const detail of await operationalBlockers(context.organizationId, context.storeId, change.moduleKey)) blockers.push({ code: "operational_blocker", moduleKey: change.moduleKey, detail });
    }
    return { context, snapshot, preset: input.preset, targetModuleKeys: [...target], changes, blockers };
  }

  static async applyPreset(input: { preset: Exclude<ModulePreset, "custom">; existingContext?: AccessContext }) {
    const preview = await this.previewPreset(input);
    if (preview.blockers.length > 0) throw new ModulePresetConfigurationError(preview.blockers);
    if (!preview.context.storeId) throw new Error("Module configuration requires an active store");
    const admin = createAdminClient();
    const { error } = await admin.rpc("set_store_module_preset_internal", {
      p_organization_id: preview.context.organizationId,
      p_store_id: preview.context.storeId,
      p_module_preset: preview.preset,
      p_enabled_modules: preview.targetModuleKeys,
      p_actor_user_id: preview.context.userId,
      p_expected_revision: preview.snapshot.configRevision,
    });
    if (error) {
      if (/module configuration revision conflict/i.test(error.message ?? "")) throw new ModuleConfigurationConflictError();
      throw error;
    }
    return { ...preview, changed: preview.changes.length > 0 || preview.snapshot.preset !== preview.preset };
  }
}
