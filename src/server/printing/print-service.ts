import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";

export type ManualOrderPrintResult = {
  kind: "queued" | "retried" | "already_queued" | "reprinted" | "no_route";
  count: number;
};

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

  static async requestConfirmedOrderPrint(orderId: string): Promise<ManualOrderPrintResult> {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const id = z.string().uuid().parse(orderId);
    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin.from("orders")
      .select("id, order_status")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error("Order not found");
    if (order.order_status !== "confirmed") throw new Error("Only confirmed orders can be routed to printing");

    const { data: jobs, error: jobsError } = await admin.from("print_jobs")
      .select("id, status, attempts, max_attempts, is_reprint, created_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    if (jobsError) throw jobsError;

    const existing = jobs ?? [];
    const retryable = existing.filter((job) => job.status === "failed"
      || (job.status === "pending" && Number(job.attempts) >= Number(job.max_attempts)));
    if (retryable.length > 0) {
      const now = new Date().toISOString();
      const { error: retryError } = await admin.from("print_jobs").update({
        status: "pending",
        attempts: 0,
        available_at: now,
        processing_at: null,
        failed_at: null,
        claimed_by_agent_id: null,
        lease_expires_at: null,
        last_error: null,
        updated_at: now,
      }).in("id", retryable.map((job) => job.id))
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId);
      if (retryError) throw retryError;
      await AuditService.record(context, {
        action: "print.order_retried_manually",
        entityType: "order",
        entityId: id,
        after: { jobsRetried: retryable.length },
      });
      return { kind: "retried", count: retryable.length };
    }

    const active = existing.filter((job) => job.status === "pending" || job.status === "processing");
    if (active.length > 0) return { kind: "already_queued", count: active.length };

    const printedOriginals = existing.filter((job) => job.status === "printed" && !job.is_reprint);
    if (printedOriginals.length > 0) {
      await authorize(PERMISSIONS.PRINTING_REPRINT);
      for (const job of printedOriginals) {
        await PrintQueueService.reprint(job.id, "Reimpressão manual pelo pedido");
      }
      return { kind: "reprinted", count: printedOriginals.length };
    }

    const created = await this.enqueueConfirmedOrder(id);
    if (created === 0) return { kind: "no_route", count: 0 };
    return { kind: "queued", count: created };
  }

  static reprint(jobId: string, reason: string) {
    return PrintQueueService.reprint(jobId, reason);
  }
}
