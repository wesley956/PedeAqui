import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import {
  defaultCustomWorkflowConfig,
  parseCustomWorkflowConfig,
  workflowModeSchema,
  receptionModeSchema,
  type ReceptionMode,
  type CustomWorkflowConfig,
  type OrderWorkflowMode,
} from "@/features/orders/workflow-config";
import {
  hasWorkflowStructureChanged,
  requireWorkflowSettingsMutationSource,
} from "@/features/orders/workflow-settings-mutation";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export type OrderWorkflowSettings = {
  mode: OrderWorkflowMode;
  custom: CustomWorkflowConfig;
  receptionMode?: ReceptionMode;
};

export type SaveOrderWorkflowSettingsOptions = {
  source: string;
  reason: string;
  correlationId?: string | null;
};

export class OrderWorkflowSettingsService {
  static async get(permission = PERMISSIONS.STORES_VIEW): Promise<{ context: Awaited<ReturnType<typeof authorize>>; settings: OrderWorkflowSettings }> {
    const context = await authorize(permission);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("store_operational_settings")
      .select("orders_workflow_mode, orders_custom_workflow, orders_auto_accept")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;

    const modeResult = workflowModeSchema.safeParse(data?.orders_workflow_mode ?? "standard");
    return {
      context,
      settings: {
        mode: modeResult.success ? modeResult.data : "standard",
        receptionMode: data?.orders_auto_accept ? (data.orders_custom_workflow?.receptionMode === "auto_prepare" ? "auto_prepare" : "auto_accept") : "manual",
        custom: data ? parseCustomWorkflowConfig(data.orders_custom_workflow) : defaultCustomWorkflowConfig,
      },
    };
  }

  static async save(settings: OrderWorkflowSettings, options: SaveOrderWorkflowSettingsOptions) {
    const parsedMode = workflowModeSchema.parse(settings.mode);
    const parsedCustom = parseCustomWorkflowConfig(settings.custom);
    const source = requireWorkflowSettingsMutationSource(options.source);
    const reason = options.reason.trim();
    if (!reason) throw new Error("A reason is required for workflow configuration changes.");

    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: current, error: readError } = await admin
      .from("store_operational_settings")
      .select("orders_workflow_mode, orders_custom_workflow, orders_auto_accept")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (readError) throw readError;

    const currentModeResult = workflowModeSchema.safeParse(current?.orders_workflow_mode ?? "standard");
    const beforeSettings: OrderWorkflowSettings = {
      mode: currentModeResult.success ? currentModeResult.data : "standard",
      custom: current ? parseCustomWorkflowConfig(current.orders_custom_workflow) : defaultCustomWorkflowConfig,
    };
    const receptionMode = receptionModeSchema.parse(settings.receptionMode ?? (current?.orders_auto_accept ? (current.orders_custom_workflow?.receptionMode === "auto_prepare" ? "auto_prepare" : "auto_accept") : parsedMode === "simplified" ? "auto_accept" : "manual"));
    if (parsedMode === "simplified" && receptionMode === "manual") throw new Error("O fluxo simplificado exige aceite automático.");
    if (receptionMode === "auto_prepare" && (!parsedCustom.delivery.includes("preparing") || !parsedCustom.pickup.includes("preparing"))) throw new Error("Mantenha Em preparo nos fluxos de entrega e retirada para iniciar automaticamente.");
    parsedCustom.receptionMode = receptionMode;
    parsedCustom.autoPrepareFrom = receptionMode === "auto_prepare"
      ? current?.orders_custom_workflow?.receptionMode === "auto_prepare" && current?.orders_auto_accept && current.orders_custom_workflow?.autoPrepareFrom
        ? current.orders_custom_workflow.autoPrepareFrom : new Date().toISOString()
      : null;
    const nextSettings: OrderWorkflowSettings = { mode: parsedMode, custom: parsedCustom, receptionMode };
    const structuralChange = hasWorkflowStructureChanged(beforeSettings, nextSettings);
    const beforeAutoAccept = Boolean(current?.orders_auto_accept);
    const nextAutoAccept = receptionMode !== "manual";

    const { error } = await admin.from("store_operational_settings").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      orders_workflow_mode: parsedMode,
      orders_custom_workflow: parsedCustom,
      orders_auto_accept: nextAutoAccept,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });
    if (error) throw error;

    const effectiveChange = current === null || structuralChange || beforeAutoAccept !== nextAutoAccept || current?.orders_custom_workflow?.receptionMode !== receptionMode;
    if (effectiveChange) {
      await AuditService.record(context, {
        action: "orders.workflow_settings.updated",
        entityType: "order_workflow",
        entityId: storeId,
        before: {
          workflow: beforeSettings,
          ordersAutoAccept: beforeAutoAccept,
        },
        after: {
          workflow: nextSettings,
          ordersAutoAccept: nextAutoAccept,
          mutation: {
            source,
            reason,
            structuralChange,
          },
        },
        requestId: options.correlationId ?? null,
      });
    }

    return { mode: parsedMode, custom: parsedCustom, receptionMode };
  }
}
