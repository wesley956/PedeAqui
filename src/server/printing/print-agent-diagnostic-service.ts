import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { diagnosticReportSchema, type DiagnosticRequestRow } from "@/features/printing/diagnostic-contract";

const uuid = z.string().uuid();
type AgentScope = { id: string; organization_id: string; store_id: string };

export class PrintAgentDiagnosticService {
  static async request(agentId: string, intentKey: string) {
    const id = uuid.parse(agentId);
    const key = uuid.parse(intentKey);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("active_store_required");
    // Actor and timestamp are persisted atomically with the command itself.
    const { data, error } = await createAdminClient().rpc("print_agent_request_diagnostic_internal", {
      p_agent_id: id, p_organization_id: context.organizationId, p_store_id: context.storeId,
      p_actor_user_id: context.userId, p_intent_key: key,
    });
    if (error) throw error;
    return uuid.parse(data);
  }

  static async list() {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("active_store_required");
    const { data, error } = await createAdminClient().from("print_agent_diagnostics")
      .select("id, agent_id, status, requested_at, expires_at, completed_at, report")
      .eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .order("requested_at", { ascending: false }).limit(30);
    if (error) throw error;
    const now = Date.now();
    return ((data ?? []) as DiagnosticRequestRow[]).map(row => ({
      ...row, status: row.status === "pending" && Date.parse(row.expires_at) <= now ? "expired" : row.status,
    }));
  }

  static async cancel(requestId: string) {
    const id = uuid.parse(requestId);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("active_store_required");
    const { error } = await createAdminClient().from("print_agent_diagnostics").update({ status: "cancelled" })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("status", "pending");
    if (error) throw error;
  }

  static async complete(agent: AgentScope, requestId: string, report: unknown) {
    const values = diagnosticReportSchema.parse(report);
    const { data, error } = await createAdminClient().rpc("print_agent_complete_diagnostic_internal", {
      p_agent_id: agent.id, p_request_id: uuid.parse(requestId), p_report: values,
    });
    if (error) throw error;
    return z.enum(["completed", "cancelled", "expired", "unavailable"]).parse(data);
  }
}
