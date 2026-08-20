import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AccessContext } from "@/server/access/context";

export type PermissionSnapshot = {
  roleKeys: string[];
  permissionKeys: string[];
};

const loadPermissionSnapshot = cache(async (
  userId: string,
  organizationId: string,
  storeId: string | null,
  organizationRoleId: string | null,
): Promise<PermissionSnapshot> => {
  const supabase = await createClient();
  const roleIds = new Set<string>();
  if (organizationRoleId) roleIds.add(organizationRoleId);

  if (storeId) {
    const { data: storeRoles, error: storeRolesError } = await supabase
      .from("user_store_roles")
      .select("role_id")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("user_id", userId);
    if (storeRolesError) throw storeRolesError;
    for (const row of storeRoles ?? []) if (row.role_id) roleIds.add(row.role_id);
  }

  if (roleIds.size === 0) return { roleKeys: [], permissionKeys: [] };

  const ids = [...roleIds];
  const [{ data: roles, error: rolesError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from("roles").select("id, key").eq("organization_id", organizationId).in("id", ids),
    supabase.from("role_permissions").select("permission_id").in("role_id", ids),
  ]);
  if (rolesError) throw rolesError;
  if (linksError) throw linksError;

  const permissionIds = [...new Set((links ?? []).map((row) => row.permission_id).filter(Boolean))];
  let permissionKeys: string[] = [];
  if (permissionIds.length > 0) {
    const { data: permissions, error: permissionsError } = await supabase
      .from("permissions")
      .select("key")
      .in("id", permissionIds);
    if (permissionsError) throw permissionsError;
    permissionKeys = [...new Set((permissions ?? []).map((row) => row.key))];
  }

  return {
    roleKeys: [...new Set((roles ?? []).map((role) => role.key))],
    permissionKeys,
  };
});

export class PermissionSnapshotService {
  static async load(context: AccessContext): Promise<PermissionSnapshot> {
    return loadPermissionSnapshot(context.userId, context.organizationId, context.storeId, context.roleId);
  }
}
