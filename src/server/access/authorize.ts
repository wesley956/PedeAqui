import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import type { PermissionKey } from "@/server/access/permissions";

export class AuthorizationError extends Error {
  constructor(permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export async function authorize(
  permission: PermissionKey,
  existingContext?: AccessContext,
): Promise<AccessContext> {
  const context = existingContext ?? (await getAccessContext());
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    organization_id: context.organizationId,
    store_id: context.storeId,
    permission_key: permission,
  });

  if (error) throw error;
  if (data !== true) throw new AuthorizationError(permission);

  return context;
}
