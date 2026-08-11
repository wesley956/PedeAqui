import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";

export class PrintService {
  static async enqueueConfirmedOrder(orderId: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const id = z.string().uuid().parse(orderId);
    const admin = createAdminClient();
    const { data: order, error: readError } = await admin.from("orders").select("id, order_status")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (readError) throw readError;
    if (!order) throw new Error("Order not found");
    if (order.order_status !== "confirmed") throw new Error("Only confirmed orders can be routed to printing");
    const { data, error } = await admin.rpc("enqueue_order_print_internal", { p_order_id: id });
    if (error) throw error;
    const count = Number(data ?? 0);
    await AuditService.record(context, {
      action: "print.order_routed_manually",
      entityType: "order",
      entityId: id,
      after: { jobsCreated: count },
    });
    return count;
  }

  static reprint(jobId: string, reason: string) {
    return PrintQueueService.reprint(jobId, reason);
  }
}
