import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { canAccessModuleRoute, type ModuleRbacDecision } from "@/modules/module-rbac";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import type { PermissionKey } from "@/server/access/permissions";

export class AuthorizationError extends Error {
  constructor(permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export class ModuleAuthorizationError extends Error {
  constructor(moduleKey: string) {
    super(`Module access denied: ${moduleKey}`);
    this.name = "ModuleAuthorizationError";
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

/**
 * Server-side counterpart of the navigation module gate. It is opt-in during rollout so the current
 * production authorization path remains unchanged until a caller explicitly adopts the modular decision.
 */
export async function authorizeModuleDecision(
  decision: ModuleRbacDecision,
  existingContext?: AccessContext,
): Promise<AccessContext> {
  if (!canAccessModuleRoute(decision)) throw new ModuleAuthorizationError(decision.moduleKey);
  return existingContext ?? (await getAccessContext());
}
