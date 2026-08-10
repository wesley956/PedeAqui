import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/access/authorize";
import { getAccessContext } from "@/server/access/context";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";

const customRoleSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,48}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  permissions: z.array(z.string()).min(1),
});

export class RoleService {
  static async list() {
    const context = await getAccessContext();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("roles")
      .select("id, key, name, description, is_system")
      .eq("organization_id", context.organizationId)
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw error;
    return data ?? [];
  }

  static async createCustom(input: z.input<typeof customRoleSchema>) {
    const values = customRoleSchema.parse(input);
    const context = await authorize(PERMISSIONS.TEAM_MANAGE);
    const admin = createAdminClient();

    const uniquePermissionKeys = [...new Set(values.permissions)];
    const { data: permissions, error: permissionError } = await admin
      .from("permissions")
      .select("id, key")
      .in("key", uniquePermissionKeys);
    if (permissionError) throw permissionError;
    if ((permissions ?? []).length !== uniquePermissionKeys.length) {
      throw new Error("Unknown permission in custom role");
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .insert({
        organization_id: context.organizationId,
        key: values.key,
        name: values.name,
        description: values.description ?? null,
        is_system: false,
      })
      .select("id, key, name, description, is_system")
      .single();
    if (roleError) throw roleError;

    const { error: linksError } = await admin.from("role_permissions").insert(
      (permissions ?? []).map((permission) => ({
        role_id: role.id,
        permission_id: permission.id,
      })),
    );
    if (linksError) {
      await admin.from("roles").delete().eq("id", role.id).eq("organization_id", context.organizationId);
      throw linksError;
    }

    await AuditService.record(context, {
      action: "role.created",
      entityType: "role",
      entityId: role.id,
      after: { ...role, permissions: uniquePermissionKeys },
    });

    return role;
  }

  static async can(permission: PermissionKey) {
    try {
      await authorize(permission);
      return true;
    } catch {
      return false;
    }
  }
}
