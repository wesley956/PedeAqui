import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

async function ownerAccess() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

export class PlatformGovernanceService {
  static async loadOnboarding() {
    const access = await ownerAccess();
    const admin = createAdminClient();
    const [organizations, stores, tasks] = await Promise.all([
      admin.from("organizations").select("id,name,status").order("name"),
      admin.from("stores").select("id,organization_id,name,status,is_primary").order("name"),
      admin.from("platform_onboarding_tasks").select("id,organization_id,store_id,step_key,label,status,note,assigned_to,due_at,completed_at,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
    ]);
    for (const result of [organizations, stores, tasks]) if (result.error) throw result.error;
    return { role: access.role, organizations: organizations.data ?? [], stores: stores.data ?? [], tasks: tasks.data ?? [] };
  }

  static async loadCommunication() {
    const access = await ownerAccess();
    const admin = createAdminClient();
    const [organizations, messages] = await Promise.all([
      admin.from("organizations").select("id,name,status").order("name"),
      admin.from("platform_customer_messages").select("id,organization_id,channel,kind,title,body,status,scheduled_at,sent_at,last_error,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
    ]);
    for (const result of [organizations, messages]) if (result.error) throw result.error;
    return { role: access.role, organizations: organizations.data ?? [], messages: messages.data ?? [] };
  }

  static async loadSettingsAndPrivacy() {
    const access = await ownerAccess();
    const admin = createAdminClient();
    const [settings, retention, privacy, organizations] = await Promise.all([
      admin.from("platform_settings").select("key,category,description,value,active,updated_at").order("category").order("key"),
      admin.from("platform_data_retention_policies").select("id,domain_key,name,description,retention_days,disposition,active,legal_basis,updated_at").order("domain_key"),
      admin.from("platform_privacy_requests").select("id,organization_id,requester_user_id,requester_reference,request_type,status,legal_hold,reason,decision_note,protocol,requested_at,decided_at,completed_at,updated_at").order("requested_at", { ascending: false }).limit(300),
      admin.from("organizations").select("id,name").order("name"),
    ]);
    for (const result of [settings, retention, privacy, organizations]) if (result.error) throw result.error;
    return { role: access.role, settings: settings.data ?? [], retention: retention.data ?? [], privacy: privacy.data ?? [], organizations: organizations.data ?? [] };
  }
}
