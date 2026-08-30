import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";

export class PlatformCrmService {
  static async load() {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const admin = createAdminClient();
    const [base, organizations] = await Promise.all([
      PlatformBackofficeService.loadCrm(),
      admin.from("organizations").select("id,name,status").order("name"),
    ]);
    if (organizations.error) throw organizations.error;
    return { ...base, organizations: organizations.data ?? [] };
  }
}
