import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { dashboardSnapshotSchema } from "@/server/dashboard/dashboard-model";

export class DashboardService {
  static async snapshot(now = new Date()) {
    const context = await authorize(PERMISSIONS.DASHBOARD_VIEW);
    if (!context.storeId) throw new Error("An active store is required");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("dashboard_snapshot_internal", {
      p_store_id: context.storeId,
      p_now: now.toISOString(),
    });
    if (error) throw error;

    return {
      context,
      snapshot: dashboardSnapshotSchema.parse(data),
    };
  }
}
