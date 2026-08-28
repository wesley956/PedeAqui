import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import {
  defaultCustomWorkflowConfig,
  parseCustomWorkflowConfig,
  workflowModeSchema,
  type CustomWorkflowConfig,
  type OrderWorkflowMode,
} from "@/features/orders/workflow-config";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export type OrderWorkflowSettings = {
  mode: OrderWorkflowMode;
  custom: CustomWorkflowConfig;
};

export class OrderWorkflowSettingsService {
  static async get(permission = PERMISSIONS.STORES_VIEW): Promise<{ context: Awaited<ReturnType<typeof authorize>>; settings: OrderWorkflowSettings }> {
    const context = await authorize(permission);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("store_operational_settings")
      .select("orders_workflow_mode, orders_custom_workflow")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;

    const modeResult = workflowModeSchema.safeParse(data?.orders_workflow_mode ?? "standard");
    return {
      context,
      settings: {
        mode: modeResult.success ? modeResult.data : "standard",
        custom: data ? parseCustomWorkflowConfig(data.orders_custom_workflow) : defaultCustomWorkflowConfig,
      },
    };
  }

  static async save(settings: OrderWorkflowSettings) {
    const parsedMode = workflowModeSchema.parse(settings.mode);
    const parsedCustom = parseCustomWorkflowConfig(settings.custom);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: current, error: readError } = await admin
      .from("store_operational_settings")
      .select("orders_auto_accept")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (readError) throw readError;

    const { error } = await admin.from("store_operational_settings").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      orders_workflow_mode: parsedMode,
      orders_custom_workflow: parsedCustom,
      orders_auto_accept: parsedMode === "simplified" ? true : Boolean(current?.orders_auto_accept),
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });
    if (error) throw error;

    return { mode: parsedMode, custom: parsedCustom };
  }
}
