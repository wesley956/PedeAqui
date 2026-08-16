import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/sql/100_whatsapp_embedded_signup.sql");
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

  it("binds completion to authenticated organization, store, user, expiry and anti-CSRF state", () => {
    expect(service).toContain("authorize(PERMISSIONS.CONVERSATIONS_MANAGE)");
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).toContain('.eq("initiated_by", context.userId)');
    expect(service).toContain("session.expires_at");
    expect(service).toContain("stateHash(values.stateToken) !== session.state_token_sha256");
  });

  it("validates WABA/phone ownership and prevents the same phone across tenants", () => {
    expect(service).toContain("verifyPhoneBelongsToWaba");
    expect(service).toContain('/phone_numbers?fields=id');
    expect(service).toContain('.eq("whatsapp_phone_number_id", values.phoneNumberId)');
    expect(service).toContain('.neq("store_id", storeId)');
  });

  it("uses the PedeAqui system user, subscribes the WABA and registers the phone", () => {
    expect(service).toContain("META_SYSTEM_USER_ID");
    expect(service).toContain("META_SYSTEM_USER_ACCESS_TOKEN");
    expect(service).toContain("META_BUSINESS_ID");
    expect(service).toContain("/assigned_users?");
    expect(service).toContain("/subscribed_apps");
    expect(service).toContain("/register");
    expect(service).toContain('messaging_product: "whatsapp"');
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

  it("gives the restaurant a self-service connect/reconnect/disconnect experience", () => {
    expect(page).toContain("MetaEmbeddedSignupCard");
    expect(client).toContain("Conectar meu WhatsApp");
    expect(client).toContain("Reconectar WhatsApp");
    expect(client).toContain("Desconectar");
    expect(service).toContain('connection_status: "disconnected"');
    expect(service).not.toContain('.delete().eq("conversation');
  });

  it("documents server-only platform prerequisites", () => {
    for (const key of ["META_APP_ID", "META_EMBEDDED_SIGNUP_CONFIG_ID", "META_BUSINESS_ID", "META_SYSTEM_USER_ID", "META_SYSTEM_USER_ACCESS_TOKEN"]) {
      expect(env).toContain(`${key}=`);
    }
    expect(env).not.toContain("NEXT_PUBLIC_META_SYSTEM_USER_ACCESS_TOKEN");
  });
});
