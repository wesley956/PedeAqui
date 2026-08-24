import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  embeddedSignupFeatureType,
  embeddedSignupSuccessEvent,
  parseEmbeddedSignupResult,
} from "@/features/conversations/whatsapp-connection-model";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/sql/100_whatsapp_embedded_signup.sql");
const modesMigration = read("supabase/sql/140_whatsapp_connection_modes.sql");
const service = read("src/server/conversations/meta-embedded-signup-service.ts");
const client = read("src/features/conversations/meta-embedded-signup-card.tsx");
const page = read("src/app/(app)/configuracoes/conversas/page.tsx");
const env = read(".env.example");

describe("[331] Meta Embedded Signup multitenant", () => {
  it("keeps onboarding sessions service-role only and stores only a state hash", () => {
    expect(migration).toContain("whatsapp_embedded_signup_sessions");
    expect(migration).toContain("state_token_sha256");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.whatsapp_embedded_signup_sessions from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.whatsapp_embedded_signup_sessions to service_role");
    expect(migration).not.toContain("state_token text");
  });

  it("keeps the registration PIN in Vault and private RPCs", () => {
    expect(migration).toContain("registration_pin_secret_id uuid");
    expect(migration).toContain("vault.create_secret");
    expect(migration).toContain("vault.update_secret");
    expect(migration).toContain("revoke all on function public.whatsapp_channel_registration_pin_internal(uuid) from public, anon, authenticated");
    expect(client).not.toContain("registrationPin");
  });

  it("persists an explicit connection mode without changing existing channels", () => {
    expect(modesMigration).toContain("connection_mode text not null default 'cloud_api'");
    expect(modesMigration).toContain("'cloud_api','coexistence'");
    expect(modesMigration).toContain("store_conversation_settings_mode_status_idx");
  });

  it("binds completion to authenticated organization, store, user, expiry, mode and anti-CSRF state", () => {
    expect(service).toContain("authorize(PERMISSIONS.CONVERSATIONS_MANAGE)");
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).toContain('.eq("initiated_by", context.userId)');
    expect(service).toContain("session.expires_at");
    expect(service).toContain("stateHash(values.stateToken) !== session.state_token_sha256");
    expect(service).toContain("session.connection_mode !== values.mode");
  });

  it("validates WABA/phone ownership server-side and prevents the same phone across tenants", () => {
    expect(service).toContain("resolveAuthorizedPhoneNumber");
    expect(service).toContain('/phone_numbers?fields=id');
    expect(service).toContain('.eq("whatsapp_phone_number_id", phoneNumberId)');
    expect(service).toContain('.neq("store_id", storeId)');
    expect(service.indexOf("resolveAuthorizedPhoneNumber")).toBeLessThan(service.indexOf('.eq("whatsapp_phone_number_id", phoneNumberId)'));
  });

  it("uses the PedeAqui system user and subscribes the WABA in both connection modes", () => {
    expect(service).toContain("META_SYSTEM_USER_ID");
    expect(service).toContain("META_SYSTEM_USER_ACCESS_TOKEN");
    expect(service).toContain("META_BUSINESS_ID");
    expect(service).toContain("/assigned_users?");
    expect(service).toContain("/subscribed_apps");
  });

  it("registers only dedicated Cloud API numbers and preserves coexistence registration", () => {
    expect(service).toContain('if (mode === "cloud_api")');
    expect(service).toContain("registerPhone(phoneNumberId");
    expect(service).toContain('/register`');
    expect(service).toContain('messaging_product: "whatsapp"');
    expect(embeddedSignupFeatureType("cloud_api")).toBe("");
    expect(embeddedSignupFeatureType("coexistence")).toBe("whatsapp_business_app_onboarding");
  });

  it("accepts Meta completion variants used by dedicated and coexistence onboarding", () => {
    expect(embeddedSignupSuccessEvent("FINISH")).toBe(true);
    expect(embeddedSignupSuccessEvent("FINISH_ONLY_WABA")).toBe(true);
    expect(embeddedSignupSuccessEvent("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")).toBe(true);
    expect(embeddedSignupSuccessEvent("CANCEL")).toBe(false);

    expect(parseEmbeddedSignupResult({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      data: { waba_id: "123456789", business_id: "987654321" },
    }, "coexistence")).toEqual({
      mode: "coexistence",
      wabaId: "123456789",
      phoneNumberId: null,
      businessId: "987654321",
    });
  });

  it("revalidates connected channels and exposes recoverable health states", () => {
    expect(service).toContain("HEALTH_STALE_MS");
    expect(service).toContain("inspectPhoneNumber");
    expect(service).toContain('connection_status: retryable ? "temporarily_unavailable" : "action_required"');
    expect(service).toContain("last_health_check_at");
  });

  it("does not silently attach PedeAqui credit to customer WABAs", () => {
    expect(service).not.toContain("whatsapp_credit_sharing_and_attach");
    expect(migration).toContain("meta_billing_mode text not null default 'unconfigured'");
  });

  it("never exposes permanent platform credentials in the client bundle", () => {
    for (const secret of ["META_SYSTEM_USER_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]) {
      expect(client).not.toContain(secret);
    }
    expect(client).toContain("WA_EMBEDDED_SIGNUP");
    expect(client).toContain("config_id: configId");
    expect(client).toContain('response_type: "code"');
  });

  it("gives the restaurant a simple coexistence-first connection experience", () => {
    expect(page).toContain("MetaEmbeddedSignupCard");
    expect(client).toContain("Já uso WhatsApp Business no celular");
    expect(client).toContain("RECOMENDADO");
    expect(client).toContain("QR Code");
    expect(client).toContain("Quero usar um número exclusivo no PedeAqui");
    expect(client).toContain("Reconectar WhatsApp");
    expect(client).toContain("Desconectar");
    expect(client).toContain("Faça um teste rápido");
    expect(client).toContain("Esse teste verifica somente o atendimento e não cria nem altera pedidos.");
    expect(client).not.toContain("Conexão oficial da Meta");
    expect(page).not.toContain("Embedded Signup");
    expect(service).toContain('connection_status: "disconnected"');
    expect(service).not.toContain('.delete().eq("conversation');
  });

  it("documents server-only platform prerequisites without exposing secrets publicly", () => {
    for (const key of ["META_APP_ID", "META_EMBEDDED_SIGNUP_CONFIG_ID", "META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID", "META_BUSINESS_ID", "META_SYSTEM_USER_ID", "META_SYSTEM_USER_ACCESS_TOKEN"]) {
      expect(env).toContain(`${key}=`);
    }
    expect(env).not.toContain("NEXT_PUBLIC_META_SYSTEM_USER_ACCESS_TOKEN");
  });
});
