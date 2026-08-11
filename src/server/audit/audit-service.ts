import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";
import { redactSensitive } from "@/server/observability/redact";

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class AuditService {
  static async record(context: AccessContext, entry: AuditEntry) {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      organization_id: context.organizationId,
      store_id: context.storeId,
      actor_user_id: context.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before_data: entry.before === undefined ? null : redactSensitive(entry.before),
      after_data: entry.after === undefined ? null : redactSensitive(entry.after),
      request_id: entry.requestId ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });

    if (error) throw error;
  }
}
