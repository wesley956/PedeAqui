import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const decisionSchema = z.object({
  changeId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
});

async function requireSuperAdmin() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

async function requireClientModuleRequest(changeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscription_change_requests")
    .select("id,change_type,status,requested_store_id")
    .eq("id", changeId)
    .maybeSingle();
  if (error) throw error;
  if (data?.change_type !== "add_on" || data.status !== "draft" || !data.requested_store_id) {
    throw new Error("Client module request required");
  }
  return data;
}

export class PlatformModuleRequestService {
  static async isClientModuleRequest(changeId: string) {
    const parsed = z.string().uuid().parse(changeId);
    await requireSuperAdmin();
    try {
      await requireClientModuleRequest(parsed);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "Client module request required") return false;
      throw error;
    }
  }

  static async approve(input: z.input<typeof decisionSchema>) {
    const values = decisionSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_module_request_approve_internal", {
      p_change_id: values.changeId,
      p_actor_user_id: access.user.id,
      p_reason: values.reason,
      p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async reject(input: z.input<typeof decisionSchema>) {
    const values = decisionSchema.parse(input);
    const access = await requireSuperAdmin();
    await requireClientModuleRequest(values.changeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_change_cancel_internal", {
      p_change_id: values.changeId,
      p_actor_user_id: access.user.id,
      p_reason: values.reason,
      p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }
}
