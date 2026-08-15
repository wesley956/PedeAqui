import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const commonSchema = z.object({
  organizationId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
  idempotencyKey: z.string().trim().min(8).max(160),
});

const memberSchema = commonSchema.extend({ memberId: z.string().uuid() });
const invitationSchema = commonSchema.extend({ invitationId: z.string().uuid() });
const roleSchema = memberSchema.extend({
  storeId: z.string().uuid(),
  roleId: z.string().uuid(),
  confirmation: z.literal("ALTERAR ACESSO"),
});

export type AccountSupportCommon = z.input<typeof commonSchema>;

function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function maskEmail(email: string | null | undefined) {
  if (!email) return "e-mail indisponível";
  const [local = "", domain] = email.toLowerCase().split("@");
  if (!local || !domain) return "e-mail indisponível";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

async function platformAccess(requireSuperAdmin = false) {
  const access = await PlatformAdminService.access();
  if (requireSuperAdmin && access.role !== "super_admin") throw new PlatformAuthorizationError();
  return { ...access, admin: createAdminClient() };
}

async function assertOrganization(admin: ReturnType<typeof createAdminClient>, organizationId: string) {
  const { data, error } = await admin.from("organizations").select("id,name,status").eq("id", organizationId).single();
  if (error || !data) throw new Error("Empresa não encontrada.");
  return data;
}

async function assertMember(admin: ReturnType<typeof createAdminClient>, organizationId: string, memberId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("id,organization_id,user_id,status,joined_at,created_at,updated_at")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .single();
  if (error || !data) throw new Error("Usuário não pertence a esta empresa.");
  return data;
}

async function claim(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  scope: string,
  idempotencyKey: string,
  fingerprint: string,
) {
  const { error } = await admin.from("idempotency_keys").insert({
    organization_id: organizationId,
    store_id: null,
    scope,
    idempotency_key: idempotencyKey,
    request_fingerprint: fingerprint,
    status: "processing",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function finishClaim(admin: ReturnType<typeof createAdminClient>, organizationId: string, scope: string, idempotencyKey: string, ok: boolean) {
  await admin
    .from("idempotency_keys")
    .update({ status: ok ? "completed" : "failed", response_code: ok ? 200 : 500, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("scope", scope)
    .eq("idempotency_key", idempotencyKey);
}

async function audit(
  admin: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  input: AccountSupportCommon,
  action: string,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  storeId: string | null = null,
) {
  const { error } = await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    store_id: storeId,
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_data: before,
    after_data: { ...(after ?? {}), support_reason: input.reason, protocol: input.protocol },
    request_id: input.protocol,
  });
  if (error) throw error;
}

export class PlatformAccountSupportService {
  static async load(query = "") {
    const { role, admin } = await platformAccess(false);
    const [organizations, stores, members, storeRoles, roles, rolePermissions, permissions, invitations, authUsers] = await Promise.all([
      admin.from("organizations").select("id,name,status").order("name").limit(300),
      admin.from("stores").select("id,organization_id,name,status,is_primary").order("name").limit(1000),
      admin.from("organization_members").select("id,organization_id,user_id,status,joined_at,created_at,updated_at").order("updated_at", { ascending: false }).limit(500),
      admin.from("user_store_roles").select("organization_id,store_id,user_id,role_id").limit(3000),
      admin.from("roles").select("id,organization_id,key,name,description,is_system").order("name").limit(1000),
      admin.from("role_permissions").select("role_id,permission_id").limit(5000),
      admin.from("permissions").select("id,key,description").limit(1000),
      admin.from("invitations").select("id,organization_id,email,role_id,store_ids,expires_at,accepted_at,created_at").order("created_at", { ascending: false }).limit(500),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    for (const result of [organizations, stores, members, storeRoles, roles, rolePermissions, permissions, invitations]) {
      if (result.error) throw result.error;
    }
    if (authUsers.error) throw authUsers.error;

    const orgById = new Map((organizations.data ?? []).map((item) => [item.id, item]));
    const storeById = new Map((stores.data ?? []).map((item) => [item.id, item]));
    const roleById = new Map((roles.data ?? []).map((item) => [item.id, item]));
    const permissionById = new Map((permissions.data ?? []).map((item) => [item.id, item]));
    const permissionIdsByRole = new Map<string, string[]>();
    for (const link of rolePermissions.data ?? []) permissionIdsByRole.set(link.role_id, [...(permissionIdsByRole.get(link.role_id) ?? []), link.permission_id]);
    const authById = new Map((authUsers.data.users ?? []).map((user) => [user.id, user]));
    const normalizedQuery = query.trim().toLowerCase();

    const safeMembers = (members.data ?? []).map((member) => {
      const authUser = authById.get(member.user_id);
      const org = orgById.get(member.organization_id);
      const assignments = (storeRoles.data ?? []).filter((item) => item.organization_id === member.organization_id && item.user_id === member.user_id).map((item) => {
        const store = storeById.get(item.store_id);
        const assignedRole = roleById.get(item.role_id);
        const permissionKeys = (permissionIdsByRole.get(item.role_id) ?? []).map((id) => permissionById.get(id)?.key).filter((value): value is string => Boolean(value));
        return {
          storeId: item.store_id,
          storeName: store?.name ?? "Unidade indisponível",
          storeStatus: store?.status ?? "unknown",
          roleId: item.role_id,
          roleKey: assignedRole?.key ?? "unknown",
          roleName: assignedRole?.name ?? "Função indisponível",
          permissions: permissionKeys.sort(),
        };
      });
      return {
        memberId: member.id,
        userId: member.user_id,
        organizationId: member.organization_id,
        organizationName: org?.name ?? "Empresa indisponível",
        status: member.status,
        emailMasked: maskEmail(authUser?.email),
        emailSearch: authUser?.email?.toLowerCase() ?? "",
        accountExists: Boolean(authUser),
        lastSignInAt: authUser?.last_sign_in_at ?? null,
        assignments,
      };
    }).filter((member) => !normalizedQuery || [member.organizationName.toLowerCase(), member.emailSearch, ...member.assignments.map((item) => item.storeName.toLowerCase())].some((value) => value.includes(normalizedQuery)));

    const now = Date.now();
    const safeInvitations = (invitations.data ?? []).map((invite) => {
      const org = orgById.get(invite.organization_id);
      const assignedRole = invite.role_id ? roleById.get(invite.role_id) : null;
      const storeNames: string[] = (invite.store_ids ?? []).map((id: string) => storeById.get(id)?.name ?? "Unidade indisponível");
      const state = invite.accepted_at ? "accepted" : new Date(invite.expires_at).getTime() <= now ? "expired" : "pending";
      return {
        invitationId: invite.id,
        organizationId: invite.organization_id,
        organizationName: org?.name ?? "Empresa indisponível",
        emailMasked: maskEmail(invite.email),
        emailSearch: invite.email.toLowerCase(),
        roleName: assignedRole?.name ?? "Função indisponível",
        roleKey: assignedRole?.key ?? "unknown",
        storeNames,
        expiresAt: invite.expires_at,
        state,
      };
    }).filter((invite) => !normalizedQuery || [invite.organizationName.toLowerCase(), invite.emailSearch, ...invite.storeNames.map((name: string) => name.toLowerCase())].some((value) => value.includes(normalizedQuery)));

    const assignableRoles = (roles.data ?? []).filter((item) => item.key !== "owner").map((item) => ({ id: item.id, organizationId: item.organization_id, key: item.key, name: item.name }));
    const safeStores = (stores.data ?? []).map((item) => ({ id: item.id, organizationId: item.organization_id, name: item.name, status: item.status }));

    return {
      role,
      canMutateAccess: role === "super_admin",
      members: safeMembers,
      invitations: safeInvitations,
      roles: assignableRoles,
      stores: safeStores,
      totals: {
        activeMembers: safeMembers.filter((item) => item.status === "active").length,
        inactiveMembers: safeMembers.filter((item) => item.status !== "active").length,
        pendingInvites: safeInvitations.filter((item) => item.state === "pending").length,
        expiredInvites: safeInvitations.filter((item) => item.state === "expired").length,
      },
    };
  }

  static async sendPasswordRecovery(input: z.input<typeof memberSchema>) {
    const values = memberSchema.parse(input);
    const { user, admin } = await platformAccess(false);
    await assertOrganization(admin, values.organizationId);
    const member = await assertMember(admin, values.organizationId, values.memberId);
    const scope = "platform.account.password_recovery";
    if (!await claim(admin, values.organizationId, scope, values.idempotencyKey, member.user_id)) return { duplicate: true };
    try {
      const { data, error } = await admin.auth.admin.getUserById(member.user_id);
      if (error || !data.user?.email) throw new Error("Conta de autenticação não encontrada.");
      const { error: sendError } = await admin.auth.resetPasswordForEmail(data.user.email, {
        redirectTo: `${getAppUrl()}/auth/callback?next=/nova-senha`,
      });
      if (sendError) throw sendError;
      await audit(admin, user.id, values, "platform.account.password_recovery_sent", "organization_member", member.id, null, { user_id: member.user_id });
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, true);
      return { duplicate: false };
    } catch (error) {
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, false);
      throw error;
    }
  }

  static async reissueInvitation(input: z.input<typeof invitationSchema>) {
    const values = invitationSchema.parse(input);
    const { user, admin } = await platformAccess(false);
    await assertOrganization(admin, values.organizationId);
    const { data: invite, error } = await admin.from("invitations").select("id,organization_id,email,role_id,store_ids,token_hash,expires_at,accepted_at,invited_by").eq("id", values.invitationId).eq("organization_id", values.organizationId).single();
    if (error || !invite) throw new Error("Convite não encontrado.");
    if (invite.accepted_at) throw new Error("Este convite já foi aceito.");
    const { data: role } = await admin.from("roles").select("id,key").eq("id", invite.role_id).eq("organization_id", values.organizationId).single();
    if (!role || role.key === "owner") throw new Error("Este convite exige revisão administrativa reforçada.");
    const uniqueStoreIds = [...new Set(invite.store_ids ?? [])];
    const { data: validStores } = await admin.from("stores").select("id").eq("organization_id", values.organizationId).in("id", uniqueStoreIds);
    if ((validStores ?? []).length !== uniqueStoreIds.length) throw new Error("O convite contém unidade inválida.");

    const scope = "platform.account.invitation_reissue";
    if (!await claim(admin, values.organizationId, scope, values.idempotencyKey, invite.id)) return { duplicate: true };
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    try {
      const { error: updateError } = await admin.from("invitations").update({ token_hash: tokenHash, expires_at: expiresAt, invited_by: user.id }).eq("id", invite.id).eq("organization_id", values.organizationId);
      if (updateError) throw updateError;
      const next = encodeURIComponent(`/convite?token=${rawToken}`);
      const redirectTo = `${getAppUrl()}/auth/callback?next=${next}`;
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;
      const existing = users.users.some((account) => account.email?.toLowerCase() === invite.email.toLowerCase());
      const sendResult = existing
        ? await admin.auth.signInWithOtp({ email: invite.email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } })
        : await admin.auth.admin.inviteUserByEmail(invite.email, { redirectTo });
      if (sendResult.error) throw sendResult.error;
      await audit(admin, user.id, values, "platform.account.invitation_reissued", "invitation", invite.id, { expires_at: invite.expires_at }, { expires_at: expiresAt, role_id: invite.role_id, store_ids: uniqueStoreIds });
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, true);
      return { duplicate: false };
    } catch (failure) {
      await admin.from("invitations").update({ token_hash: invite.token_hash, expires_at: invite.expires_at, invited_by: invite.invited_by }).eq("id", invite.id).eq("organization_id", values.organizationId);
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, false);
      throw failure;
    }
  }

  static async reactivateMembership(input: z.input<typeof memberSchema>) {
    const values = memberSchema.parse(input);
    const { user, admin } = await platformAccess(true);
    await assertOrganization(admin, values.organizationId);
    const member = await assertMember(admin, values.organizationId, values.memberId);
    const scope = "platform.account.membership_reactivate";
    if (!await claim(admin, values.organizationId, scope, values.idempotencyKey, member.id)) return { duplicate: true };
    try {
      const { error } = await admin.from("organization_members").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", member.id).eq("organization_id", values.organizationId);
      if (error) throw error;
      await audit(admin, user.id, values, "platform.account.membership_reactivated", "organization_member", member.id, { status: member.status }, { status: "active" });
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, true);
      return { duplicate: false };
    } catch (error) {
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, false);
      throw error;
    }
  }

  static async replaceStoreRole(input: z.input<typeof roleSchema>) {
    const values = roleSchema.parse(input);
    const { user, admin } = await platformAccess(true);
    await assertOrganization(admin, values.organizationId);
    const member = await assertMember(admin, values.organizationId, values.memberId);
    const [{ data: store }, { data: targetRole }, { data: currentAssignments }] = await Promise.all([
      admin.from("stores").select("id,organization_id,name").eq("id", values.storeId).eq("organization_id", values.organizationId).single(),
      admin.from("roles").select("id,organization_id,key,name").eq("id", values.roleId).eq("organization_id", values.organizationId).single(),
      admin.from("user_store_roles").select("role_id").eq("organization_id", values.organizationId).eq("store_id", values.storeId).eq("user_id", member.user_id),
    ]);
    if (!store) throw new Error("Unidade não pertence à empresa.");
    if (!targetRole || targetRole.key === "owner") throw new Error("Owner não pode ser concedido pela Central de Suporte.");
    const currentRoleIds = (currentAssignments ?? []).map((item) => item.role_id);
    if (currentRoleIds.length) {
      const { data: currentRoles } = await admin.from("roles").select("id,key").eq("organization_id", values.organizationId).in("id", currentRoleIds);
      if ((currentRoles ?? []).some((item) => item.key === "owner")) throw new Error("Acesso owner exige fluxo administrativo reforçado fora desta central.");
    }
    const scope = "platform.account.store_role_replace";
    if (!await claim(admin, values.organizationId, scope, values.idempotencyKey, `${member.id}:${store.id}:${targetRole.id}`)) return { duplicate: true };
    try {
      const { error: deleteError } = await admin.from("user_store_roles").delete().eq("organization_id", values.organizationId).eq("store_id", values.storeId).eq("user_id", member.user_id);
      if (deleteError) throw deleteError;
      const { error: insertError } = await admin.from("user_store_roles").insert({ organization_id: values.organizationId, store_id: values.storeId, user_id: member.user_id, role_id: targetRole.id });
      if (insertError) {
        if (currentRoleIds.length) await admin.from("user_store_roles").insert(currentRoleIds.map((roleId) => ({ organization_id: values.organizationId, store_id: values.storeId, user_id: member.user_id, role_id: roleId })));
        throw insertError;
      }
      await audit(admin, user.id, values, "platform.account.store_role_changed", "organization_member", member.id, { store_id: store.id, role_ids: currentRoleIds }, { store_id: store.id, role_id: targetRole.id }, store.id);
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, true);
      return { duplicate: false };
    } catch (error) {
      await finishClaim(admin, values.organizationId, scope, values.idempotencyKey, false);
      throw error;
    }
  }
}
