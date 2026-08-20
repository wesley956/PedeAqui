import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleKey, moduleLabel, type ModuleKey } from "@/modules/module-catalog";
import { ModuleConfigurationError, ModuleConfigurationService } from "@/server/modules/module-configuration-service";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  moduleKey: z.string().trim().refine(isModuleKey, "Módulo inválido"),
  enabled: z.boolean(),
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export type PlatformModuleSupportInput = z.infer<typeof inputSchema>;

export class PlatformModuleSupportService {
  static async preview(input: Pick<PlatformModuleSupportInput, "organizationId" | "storeId" | "moduleKey" | "enabled">) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const moduleKey = String(input.moduleKey);
    if (!isModuleKey(moduleKey)) throw new Error("Módulo inválido.");
    const preview = await ModuleConfigurationService.supportPreview({
      organizationId: input.organizationId,
      storeId: input.storeId,
      moduleKey,
      enabled: input.enabled,
    });
    return {
      status: preview.plan.status,
      requestedLabel: moduleLabel(moduleKey, preview.businessType),
      requestedEnabled: input.enabled,
      changes: preview.plan.changes.map((change) => ({
        moduleKey: change.moduleKey,
        label: moduleLabel(change.moduleKey, preview.businessType),
        enabled: change.enabled,
        reason: change.reason,
      })),
      blockers: preview.plan.blockers.map((blocker) => ({
        code: blocker.code,
        moduleKey: blocker.moduleKey,
        label: moduleLabel(blocker.moduleKey, preview.businessType),
        relatedLabel: blocker.relatedModuleKey ? moduleLabel(blocker.relatedModuleKey, preview.businessType) : null,
        detail: blocker.detail ?? null,
      })),
    };
  }

  static async apply(rawInput: PlatformModuleSupportInput) {
    const input = inputSchema.parse(rawInput);
    const moduleKey = input.moduleKey as ModuleKey;
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const admin = createAdminClient();

    const { data: store, error: storeError } = await admin.from("stores")
      .select("id,organization_id,business_type,module_config_revision")
      .eq("id", input.storeId).eq("organization_id", input.organizationId).maybeSingle();
    if (storeError) throw storeError;
    if (!store) throw new Error("Unidade não encontrada para a empresa selecionada.");

    const preview = await this.preview(input);
    if (preview.status === "blocked") {
      const blockedPlan = await ModuleConfigurationService.supportPreview({ organizationId: input.organizationId, storeId: input.storeId, moduleKey, enabled: input.enabled });
      throw new ModuleConfigurationError(blockedPlan.plan);
    }

    const scope = "platform.support.module_configuration";
    const { error: claimError } = await admin.from("idempotency_keys").insert({
      organization_id: input.organizationId,
      store_id: input.storeId,
      scope,
      idempotency_key: input.idempotencyKey,
      request_fingerprint: `${input.storeId}:${moduleKey}:${input.enabled}`,
      status: "processing",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (claimError?.code === "23505") return { duplicate: true, preview };
    if (claimError) throw claimError;

    try {
      const beforeResult = await admin.from("store_modules").select("module_key,enabled,configuration_source,catalog_version,updated_at")
        .eq("organization_id", input.organizationId).eq("store_id", input.storeId).order("module_key");
      if (beforeResult.error) throw beforeResult.error;

      const result = await ModuleConfigurationService.supportApply({
        organizationId: input.organizationId,
        storeId: input.storeId,
        moduleKey,
        enabled: input.enabled,
      });
      const afterResult = await admin.from("store_modules").select("module_key,enabled,configuration_source,catalog_version,updated_at")
        .eq("organization_id", input.organizationId).eq("store_id", input.storeId).order("module_key");
      if (afterResult.error) throw afterResult.error;

      const { error: auditError } = await admin.from("audit_logs").insert({
        organization_id: input.organizationId,
        store_id: input.storeId,
        actor_user_id: access.user.id,
        action: "platform.support.module_configuration",
        entity_type: "store",
        entity_id: input.storeId,
        before_data: { modules: beforeResult.data ?? [], revision: store.module_config_revision },
        after_data: {
          modules: afterResult.data ?? [],
          requested_module: moduleLabel(moduleKey, result.businessType),
          requested_enabled: input.enabled,
          planned_changes: preview.changes.map((change) => ({ label: change.label, enabled: change.enabled, reason: change.reason })),
          support_reason: input.reason,
        },
        request_id: input.protocol,
      });
      if (auditError) throw auditError;

      const { error: eventError } = await admin.from("domain_events").insert({
        organization_id: input.organizationId,
        store_id: input.storeId,
        event_type: "platform.support.module_configuration",
        entity_type: "store",
        entity_id: input.storeId,
        payload: { protocol: input.protocol, reason: input.reason, module_label: moduleLabel(moduleKey, result.businessType), enabled: input.enabled },
        created_by: access.user.id,
      });
      if (eventError) throw eventError;

      await admin.from("idempotency_keys").update({ status: "completed", response_code: 200, response_body: { success: true }, updated_at: new Date().toISOString() })
        .eq("organization_id", input.organizationId).eq("scope", scope).eq("idempotency_key", input.idempotencyKey);
      return { duplicate: false, preview, changed: result.changed };
    } catch (error) {
      await admin.from("idempotency_keys").update({ status: "failed", response_code: 500, response_body: { success: false }, updated_at: new Date().toISOString() })
        .eq("organization_id", input.organizationId).eq("scope", scope).eq("idempotency_key", input.idempotencyKey);
      throw error;
    }
  }
}
