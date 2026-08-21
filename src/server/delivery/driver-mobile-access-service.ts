import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { normalizeDriverPhone } from "@/server/delivery/driver-pin-auth-service";

const inputSchema = z.object({
  driverId: z.string().uuid(),
});

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export type DriverMobileAccessInvitation = {
  inviteUrl: string;
  expiresAt: string;
  phone: string;
  linked: boolean;
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
    if (!driver.phone) throw new Error("Cadastre o telefone do entregador antes de liberar o acesso");

    const phone = normalizeDriverPhone(driver.phone);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error } = await admin.from("driver_pin_access").upsert({
      driver_id: driver.id,
      organization_id: context.organizationId,
      store_id: context.storeId,
      user_id: driver.user_id,
      phone_e164: phone,
      enrollment_token_hash: tokenHash,
      enrollment_expires_at: expiresAt,
      enrollment_used_at: null,
      enabled: true,
      failed_attempts: 0,
      locked_until: null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "driver_id" });
    if (error) {
      if (error.code === "23505") throw new Error("Este telefone já está vinculado a outro entregador");
      throw error;
    }

    await AuditService.record(context, {
      action: driver.user_id ? "delivery.driver_pin_reset_issued" : "delivery.driver_pin_enrollment_issued",
      entityType: "driver",
      entityId: driver.id,
      after: { phone, expiresAt },
    });

    return {
      phone,
      inviteUrl: `${appUrl()}/primeiro-acesso-entregador?token=${encodeURIComponent(token)}`,
      expiresAt,
      linked: Boolean(driver.user_id),
    };
  }
}
