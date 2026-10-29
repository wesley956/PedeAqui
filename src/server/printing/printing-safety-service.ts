import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";
import { printingSafetyIssues } from "@/server/printing/printing-safety-policy";

/** Narrow read for an already-authorized operator; never claims or retries jobs. */
export class PrintingSafetyService {
  static async load(context: AccessContext) {
    if (!context.storeId) throw new Error("active_store_required");
    const admin = createAdminClient();
    const [agents, printers, jobs, routes] = await Promise.all([
      admin.from("print_agents").select("id,status,last_seen_at")
        .eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
      admin.from("printers").select("id,agent_id,status,last_seen_at")
        .eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
      admin.from("print_jobs").select("status,created_at")
        .eq("organization_id", context.organizationId).eq("store_id", context.storeId)
        .in("status", ["pending", "processing", "failed"]).order("created_at").limit(20),
      admin.from("station_printers").select("printer_id")
        .eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
    ]);
    for (const result of [agents, printers, jobs, routes]) if (result.error) throw result.error;
    const routed = new Set((routes.data ?? []).map((route) => route.printer_id));
    return {
      storeId: context.storeId,
      checkedAt: new Date().toISOString(),
      issues: printingSafetyIssues(
        agents.data ?? [], (printers.data ?? []).filter((printer) => routed.has(printer.id)), jobs.data ?? [],
        Date.now(), (agents.data?.length ?? 0) + (printers.data?.length ?? 0) > 0,
      ),
    };
  }
}
