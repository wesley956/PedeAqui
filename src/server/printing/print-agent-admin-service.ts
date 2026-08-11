import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { createPrintAgentToken, hashPrintAgentToken } from "@/server/printing/agent-token";

export class PrintAgentAdminService {
  static async create(name: string) {
    const safeName = z.string().trim().min(2).max(100).parse(name);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const token = createPrintAgentToken();
    const admin = createAdminClient();
    const { data, error } = await admin.from("print_agents").insert({
      organization_id: context.organizationId,
      store_id: context.storeId,
      name: safeName,
      token_hash: hashPrintAgentToken(token),
      created_by: context.userId,
    }).select("id, name").single();
    if (error) throw error;
    await AuditService.record(context, {
      action: "print.agent_created",
      entityType: "print_agent",
      entityId: data.id,
      after: { id: data.id, name: data.name },
    });
    return { id: data.id, name: data.name, token };
  }
}
