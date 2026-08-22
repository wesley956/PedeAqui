import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrganization } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

const uuid = z.string().uuid();

export class TeamManagementService {
  static async load() {
    const context = await authorizeOrganization(PERMISSIONS.TEAM_VIEW);
    const admin = createAdminClient();
    const [members, storeRoles, roles, stores, invitations, authUsers] = await Promise.all([
      admin.from("organization_members")
        .select("id,user_id,role_id,status,joined_at")
        .eq("organization_id", context.organizationId)
        .order("joined_at"),
      admin.from("user_store_roles")
        .select("user_id,role_id,store_id")
        .eq("organization_id", context.organizationId),
      admin.from("roles")
        .select("id,key,name,is_system")
        .eq("organization_id", context.organizationId)
        .order("is_system", { ascending: false })
        .order("name"),
      admin.from("stores")
        .select("id,name,status")
        .eq("organization_id", context.organizationId)
        .eq("status", "active")
        .order("name"),
      admin.from("invitations")
        .select("id,email,role_id,store_ids,expires_at,accepted_at,created_at")
        .eq("organization_id", context.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    for (const result of [members, storeRoles, roles, stores, invitations]) {
      if (result.error) throw result.error;
    }
    if (authUsers.error) throw authUsers.error;

    const roleById = new Map((roles.data ?? []).map((role) => [role.id, role]));
    const storeById = new Map((stores.data ?? []).map((store) => [store.id, store]));
    const emailByUserId = new Map(authUsers.data.users.map((user) => [user.id, user.email ?? null]));
    const assignmentsByUser = new Map<string, Array<{ roleId: string; storeId: string }>>();
    for (const assignment of storeRoles.data ?? []) {
      const current = assignmentsByUser.get(assignment.user_id) ?? [];
      current.push({ roleId: assignment.role_id, storeId: assignment.store_id });
      assignmentsByUser.set(assignment.user_id, current);
    }

    const now = Date.now();
    return {
      roles: (roles.data ?? []).filter((role) => role.key !== "owner"),
      stores: stores.data ?? [],
      members: (members.data ?? []).map((member) => {
        const organizationRole = member.role_id ? roleById.get(member.role_id) : null;
        const assignments = assignmentsByUser.get(member.user_id) ?? [];
        return {
          id: member.id,
          email: emailByUserId.get(member.user_id) ?? "Conta sem e-mail disponível",
          status: member.status,
          joinedAt: member.joined_at,
          roleNames: organizationRole
            ? [organizationRole.name]
            : [...new Set(assignments.map((entry) => roleById.get(entry.roleId)?.name).filter((name): name is string => Boolean(name)))],
          storeNames: [...new Set(assignments.map((entry) => storeById.get(entry.storeId)?.name).filter((name): name is string => Boolean(name)))],
          canSuspend: member.status === "active" && member.user_id !== context.userId && organizationRole?.key !== "owner",
        };
      }),
      invitations: (invitations.data ?? []).map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        roleName: invitation.role_id ? roleById.get(invitation.role_id)?.name ?? "Função removida" : "Sem função",
        storeNames: (invitation.store_ids ?? [])
          .map((storeId: string) => storeById.get(storeId)?.name)
          .filter((name: unknown): name is string => typeof name === "string"),
        expiresAt: invitation.expires_at,
        status: invitation.accepted_at
          ? "accepted" as const
          : new Date(invitation.expires_at).getTime() <= now
            ? "expired" as const
            : "pending" as const,
      })),
    };
  }

  static async suspendMember(memberId: string) {
    const id = uuid.parse(memberId);
    const context = await authorizeOrganization(PERMISSIONS.TEAM_MANAGE);
    const { data, error } = await createAdminClient().rpc("team_suspend_member_internal", {
      p_organization_id: context.organizationId,
      p_member_id: id,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async cancelInvitation(invitationId: string) {
    const id = uuid.parse(invitationId);
    const context = await authorizeOrganization(PERMISSIONS.TEAM_MANAGE);
    const { data, error } = await createAdminClient().rpc("team_cancel_invitation_internal", {
      p_organization_id: context.organizationId,
      p_invitation_id: id,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }
}
