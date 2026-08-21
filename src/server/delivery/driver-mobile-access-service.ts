import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { InvitationService } from "@/server/team/invitation-service";

const inputSchema = z.object({
  driverId: z.string().uuid(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
});

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export type DriverMobileAccessInvitation = {
  invitationId: string;
  email: string;
  inviteUrl: string;
  expiresAt: string;
  phone: string | null;
};

export class DriverMobileAccessService {
  static async createInvitation(input: z.input<typeof inputSchema>): Promise<DriverMobileAccessInvitation> {
    const values = inputSchema.parse(input);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária");
    const admin = createAdminClient();

    const { data: driver, error: driverError } = await admin.from("drivers")
      .select("id,name,phone,user_id")
      .eq("id", values.driverId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (driverError) throw driverError;
    if (!driver) throw new Error("Entregador não encontrado nesta unidade");
    if (driver.user_id) throw new Error("Este entregador já possui acesso mobile vinculado");

    const { data: role, error: roleError } = await admin.from("roles")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("key", "driver")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) throw new Error("Perfil de Entregador não está disponível nesta organização");

    // Reissuing access expires older pending links for this same driver, so there is one clear link to share.
    const { data: previousMappings, error: previousError } = await admin.from("driver_access_invitations")
      .select("invitation_id")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("driver_id", driver.id);
    if (previousError) throw previousError;
    const previousIds = (previousMappings ?? []).map((item) => item.invitation_id);
    if (previousIds.length > 0) {
      const { error: expireError } = await admin.from("invitations")
        .update({ expires_at: new Date().toISOString() })
        .in("id", previousIds)
        .is("accepted_at", null);
      if (expireError) throw expireError;
    }

    const invitation = await InvitationService.create({
      email: values.email,
      roleId: role.id,
      storeIds: [context.storeId],
      expiresInHours: 48,
    });

    const { error: mappingError } = await admin.from("driver_access_invitations").insert({
      invitation_id: invitation.id,
      organization_id: context.organizationId,
      store_id: context.storeId,
      driver_id: driver.id,
      created_by: context.userId,
    });
    if (mappingError) {
      await admin.from("invitations").delete().eq("id", invitation.id).eq("organization_id", context.organizationId);
      throw mappingError;
    }

    await AuditService.record(context, {
      action: "delivery.driver_mobile_access_invited",
      entityType: "driver",
      entityId: driver.id,
      after: { email: values.email, invitationId: invitation.id, expiresAt: invitation.expiresAt },
    });

    return {
      invitationId: invitation.id,
      email: values.email,
      inviteUrl: `${appUrl()}/convite?token=${encodeURIComponent(invitation.token)}`,
      expiresAt: invitation.expiresAt,
      phone: driver.phone,
    };
  }
}
