import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PIN_RE = /^\d{6}$/;

export function normalizeDriverPhone(input: string) {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  throw new Error("Informe um telefone válido com DDD");
}

export function validateDriverPin(pin: string) {
  if (!PIN_RE.test(pin)) throw new Error("O PIN deve ter exatamente 6 números");
  return pin;
}

function tokenHash(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type DriverEnrollmentPreview = {
  driverName: string;
  storeName: string;
  phone: string;
  expiresAt: string;
};

export class DriverPinAuthService {
  static async previewEnrollment(rawToken: string): Promise<DriverEnrollmentPreview | null> {
    if (!rawToken || rawToken.length < 20 || rawToken.length > 256) return null;
    const admin = createAdminClient();
    const { data: access, error } = await admin.from("driver_pin_access")
      .select("driver_id,store_id,phone_e164,enrollment_expires_at,enabled")
      .eq("enrollment_token_hash", tokenHash(rawToken))
      .maybeSingle();
    if (error || !access || !access.enabled || !access.enrollment_expires_at || new Date(access.enrollment_expires_at).getTime() <= Date.now()) return null;

    const [driverResult, storeResult] = await Promise.all([
      admin.from("drivers").select("name").eq("id", access.driver_id).is("deleted_at", null).maybeSingle(),
      admin.from("stores").select("name").eq("id", access.store_id).maybeSingle(),
    ]);
    if (driverResult.error || storeResult.error || !driverResult.data || !storeResult.data) return null;

    return {
      driverName: driverResult.data.name,
      storeName: storeResult.data.name,
      phone: access.phone_e164,
      expiresAt: access.enrollment_expires_at,
    };
  }

  static async activateEnrollment(rawToken: string, pinInput: string) {
    const pin = validateDriverPin(pinInput);
    const admin = createAdminClient();
    const { data: access, error: accessError } = await admin.from("driver_pin_access")
      .select("driver_id,organization_id,store_id,user_id,phone_e164,enrollment_expires_at,enabled")
      .eq("enrollment_token_hash", tokenHash(rawToken))
      .maybeSingle();
    if (accessError || !access || !access.enabled || !access.enrollment_expires_at || new Date(access.enrollment_expires_at).getTime() <= Date.now()) {
      throw new Error("Este link de primeiro acesso expirou ou já foi utilizado");
    }

    const { data: driver, error: driverError } = await admin.from("drivers")
      .select("id,name,user_id")
      .eq("id", access.driver_id)
      .eq("organization_id", access.organization_id)
      .eq("store_id", access.store_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (driverError || !driver) throw new Error("Entregador não encontrado");

    const existingUserId = access.user_id ?? driver.user_id;
    let userId = existingUserId;
    let createdUser = false;

    if (existingUserId) {
      const { data: roleRows, error: roleError } = await admin.from("user_store_roles")
        .select("role_id")
        .eq("user_id", existingUserId);
      if (roleError) throw roleError;
      const roleIds = [...new Set((roleRows ?? []).map((row) => row.role_id))];
      if (roleIds.length > 0) {
        const { data: roles, error: rolesError } = await admin.from("roles").select("id,key").in("id", roleIds);
        if (rolesError) throw rolesError;
        if ((roles ?? []).some((role) => role.key !== "driver")) {
          throw new Error("Esta conta possui outro perfil e não pode ser convertida para acesso por PIN");
        }
      }
      const { data, error } = await admin.auth.admin.updateUserById(existingUserId, {
        phone: access.phone_e164,
        password: pin,
        phone_confirm: true,
        user_metadata: { driver_name: driver.name, driver_id: driver.id },
      });
      if (error || !data.user) throw new Error(error?.message ?? "Não foi possível preparar o acesso do entregador");
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        phone: access.phone_e164,
        password: pin,
        phone_confirm: true,
        user_metadata: { driver_name: driver.name, driver_id: driver.id },
      });
      if (error || !data.user) {
        const message = error?.message?.toLocaleLowerCase("pt-BR") ?? "";
        if (message.includes("already") || message.includes("registered")) throw new Error("Este telefone já pertence a outra conta");
        throw new Error(error?.message ?? "Não foi possível criar o acesso do entregador");
      }
      userId = data.user.id;
      createdUser = true;
    }

    if (!userId) throw new Error("Não foi possível identificar o usuário do entregador");

    const { data: activation, error: activationError } = await admin.rpc("activate_driver_pin_access", {
      raw_token: rawToken,
      actor_user_id: userId,
    });
    if (activationError || !activation) {
      if (createdUser) await admin.auth.admin.deleteUser(userId);
      throw new Error(activationError?.message ?? "Não foi possível concluir o primeiro acesso");
    }

    const supabase = await createClient();
    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
      phone: access.phone_e164,
      password: pin,
    });
    if (signInError || !sessionData.user) throw new Error("Acesso criado. Entre com seu telefone e PIN para continuar");

    return {
      userId: sessionData.user.id,
      organizationId: access.organization_id,
      storeId: access.store_id,
    };
  }

  static async signIn(phoneInput: string, pinInput: string) {
    const phone = normalizeDriverPhone(phoneInput);
    const pin = validateDriverPin(pinInput);
    const admin = createAdminClient();
    const { data: access } = await admin.from("driver_pin_access")
      .select("user_id,organization_id,store_id,enabled,locked_until")
      .eq("phone_e164", phone)
      .maybeSingle();

    if (!access || !access.enabled || !access.user_id) throw new Error("invalid_credentials");
    if (access.locked_until && new Date(access.locked_until).getTime() > Date.now()) throw new Error("temporarily_locked");

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ phone, password: pin });
    if (error || !data.user || data.user.id !== access.user_id) {
      if (data.user && data.user.id !== access.user_id) await supabase.auth.signOut();
      const { data: lockedUntil } = await admin.rpc("register_driver_pin_failure", { p_phone: phone });
      throw new Error(lockedUntil ? "temporarily_locked" : "invalid_credentials");
    }

    const { data: success, error: successError } = await admin.rpc("register_driver_pin_success", {
      p_phone: phone,
      p_user_id: data.user.id,
    });
    if (successError || !success) {
      await supabase.auth.signOut();
      throw new Error("access_unavailable");
    }

    return {
      userId: data.user.id,
      organizationId: access.organization_id,
      storeId: access.store_id,
    };
  }
}
