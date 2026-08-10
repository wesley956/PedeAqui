import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrganization } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

const inviteSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
  storeIds: z.array(z.string().uuid()).min(1),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export type CreateInvitationInput = z.input<typeof inviteSchema>;

export type CreatedInvitation = {
  id: string;
  token: string;
  expiresAt: string;
};

export class InvitationService {
  static async create(input: CreateInvitationInput): Promise<CreatedInvitation> {
    const parsed = inviteSchema.parse(input);
    const context = await authorizeOrganization(PERMISSIONS.TEAM_MANAGE);
    const admin = createAdminClient();

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id, key")
      .eq("id", parsed.roleId)
      .eq("organization_id", context.organizationId)
      .single();
    if (roleError || !role) throw new Error("Role does not belong to the organization");
    if (role.key === "owner") throw new Error("Owner access cannot be granted through a standard invitation");

    const uniqueStoreIds = [...new Set(parsed.storeIds)];
    const { data: stores, error: storesError } = await admin
      .from("stores")
      .select("id")
      .eq("organization_id", context.organizationId)
      .in("id", uniqueStoreIds);
    if (storesError) throw storesError;
    if ((stores ?? []).length !== uniqueStoreIds.length) {
      throw new Error("One or more stores do not belong to the organization");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + parsed.expiresInHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("invitations")
      .insert({
        organization_id: context.organizationId,
        email: parsed.email.toLowerCase(),
        token_hash: tokenHash,
        role_id: parsed.roleId,
        store_ids: uniqueStoreIds,
        invited_by: context.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw error;

    await AuditService.record(context, {
      action: "team.invitation_created",
      entityType: "invitation",
      entityId: data.id,
      after: { email: parsed.email.toLowerCase(), roleId: parsed.roleId, storeIds: uniqueStoreIds, expiresAt },
    });
    await EventService.enqueue(context, {
      type: "team.invitation_created",
      entityType: "invitation",
      entityId: data.id,
      payload: { email: parsed.email.toLowerCase(), expiresAt },
    });

    // The raw token is returned exactly once and is never persisted.
    return { id: data.id, token, expiresAt };
  }
}
