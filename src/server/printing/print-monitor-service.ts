import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export class PrintMonitorService {
  static async current(limit = 100) {
    const context = await authorize(PERMISSIONS.PRINTING_VIEW);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const { data: jobs, error } = await admin.from("print_jobs")
      .select("id, order_id, station_id, printer_id, document_type, status, attempts, max_attempts, copies, available_at, processing_at, printed_at, failed_at, last_error, is_reprint, reprint_reason, created_at")
      .eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 250));
    if (error) throw error;
    const orderIds = [...new Set((jobs ?? []).map((job) => job.order_id).filter((id): id is string => Boolean(id)))];
    const orders = orderIds.length ? await admin.from("orders").select("id, display_number").in("id", orderIds) : { data: [], error: null };
    if (orders.error) throw orders.error;
    const orderNumbers = new Map((orders.data ?? []).map((order) => [order.id, order.display_number]));
    return {
      context,
      jobs: (jobs ?? []).map((job) => ({ ...job, display_number: job.order_id ? orderNumbers.get(job.order_id) ?? null : null })),
    };
  }
}
