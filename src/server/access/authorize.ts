import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import type { PermissionKey } from "@/server/access/permissions";

export class AuthorizationError extends Error {
  constructor(permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

const checkPermission = cache(async (
  organizationId: string,
  storeId: string | null,
  permission: PermissionKey,
) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    organization_id: organizationId,
    store_id: storeId,
    permission_key: permission,
  });

  if (error) throw error;
  if (data !== true) throw new AuthorizationError(permission);
});

export async function authorize(
  permission: PermissionKey,
  existingContext?: AccessContext,
): Promise<AccessContext> {
  const context = existingContext ?? (await getAccessContext());
  await checkPermission(context.organizationId, context.storeId, permission);
  return context;
}

export async function authorizeOrganization(
  permission: PermissionKey,
  existingContext?: AccessContext,
): Promise<AccessContext> {
  const context = existingContext ?? (await getAccessContext());
  await checkPermission(context.organizationId, null, permission);
  return { ...context, storeId: null };
}
