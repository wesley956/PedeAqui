import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}

export class DriverHistoryPolicyService {
  static async get() {
    const context = await authorize(PERMISSIONS.DELIVERY_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_delivery_settings")
      .select("driver_history_visible")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.driver_history_visible);
  }

  static async set(visible: boolean) {
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();

    const { data: before, error: readError } = await admin.from("store_delivery_settings")
      .select("driver_history_visible")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (readError) throw readError;

    const { data, error } = await admin.from("store_delivery_settings").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      driver_history_visible: visible,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" }).select("driver_history_visible").single();
    if (error) throw error;

    await AuditService.record(context, {
      action: "delivery.driver_history_visibility_updated",
      entityType: "store",
      entityId: storeId,
      before,
      after: data,
    });

    return Boolean(data.driver_history_visible);
  }
}
