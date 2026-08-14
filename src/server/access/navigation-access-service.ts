import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import { contextsForRoleKeys, contextualNavigation } from "@/components/layout/navigation-model";

export type NavigationAccess = {
  context: AccessContext;
  roleKeys: string[];
  operationalContexts: ReturnType<typeof contextsForRoleKeys>;
  permissionKeys: string[];
  items: ReturnType<typeof contextualNavigation>;
};

export class NavigationAccessService {
  static async load(): Promise<NavigationAccess> {
    const context = await getAccessContext();
    const supabase = await createClient();
    const roleIds = new Set<string>();
    if (context.roleId) roleIds.add(context.roleId);

    if (context.storeId) {
      const { data: storeRoles, error: storeRolesError } = await supabase
        .from("user_store_roles")
        .select("role_id")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .eq("user_id", context.userId);
      if (storeRolesError) throw storeRolesError;
      for (const row of storeRoles ?? []) if (row.role_id) roleIds.add(row.role_id);
    }

    if (roleIds.size === 0) {
      return { context, roleKeys: [], operationalContexts: [], permissionKeys: [], items: [] };
    }

    const ids = [...roleIds];
    const [{ data: roles, error: rolesError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("roles").select("id, key").eq("organization_id", context.organizationId).in("id", ids),
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

    const roleKeys = [...new Set((roles ?? []).map((role) => role.key))];
    const operationalContexts = contextsForRoleKeys(roleKeys);
    const items = contextualNavigation(operationalContexts, new Set(permissionKeys), false);

    return { context, roleKeys, operationalContexts, permissionKeys, items };
  }
}
