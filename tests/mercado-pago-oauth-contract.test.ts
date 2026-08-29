import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Mercado Pago OAuth rollout contract", () => {
  it("keeps OAuth additive and disabled when a seller connects", () => {
    const sql = read("supabase/sql/153_mercado_pago_oauth_connection.sql");
    expect(sql).toContain("connection_mode text not null default 'manual'");
    expect(sql).toContain("refresh_token_secret_id uuid");
    expect(sql).toContain("vault.create_secret");
    expect(sql).toContain("vault.update_secret");
    expect(sql).toContain("enabled = false");
    expect(sql).toContain("grant execute on function public.order_payment_provider_oauth_connect_internal");
    expect(sql).toContain("to service_role");
  });

  it("uses Authorization Code with state and PKCE S256", () => {
    const oauth = read("src/server/payments/providers/mercado-pago-oauth.ts");
    expect(oauth).toContain('url.searchParams.set("response_type", "code")');
    expect(oauth).toContain('url.searchParams.set("state", input.state)');
    expect(oauth).toContain('url.searchParams.set("code_challenge", input.challenge)');
    expect(oauth).toContain('url.searchParams.set("code_challenge_method", "S256")');
    expect(oauth).toContain('grant_type: "authorization_code"');
    expect(oauth).toContain("code_verifier: input.verifier");
    expect(oauth).toContain('createHmac("sha256", clientSecret())');
  });

  it("revalidates tenant context before persisting seller credentials", () => {
    const callback = read("src/app/api/integrations/mercado-pago/oauth/callback/route.ts");
    expect(callback).toContain("await authorize(PERMISSIONS.PAYMENTS_MANAGE)");
    expect(callback).toContain("context.storeId !== oauthSession.storeId");
    expect(callback).toContain("context.organizationId !== oauthSession.organizationId");
    expect(callback).toContain("connectOAuthCurrentStore");
  });

  it("keeps seller connection and Pix activation as separate operations", () => {
    const settings = read("src/app/(app)/configuracoes/pagamentos/page.tsx");
    const actions = read("src/features/payments/actions.ts");
    expect(settings).toContain("Conectar a conta não ativa o Pix");
    expect(settings).toContain("toggleOnlinePixProviderAction");
    expect(actions).toContain("setCurrentStoreEnabled");
    expect(actions).toContain("disconnectOAuthCurrentStore");
  });

  it("stores, rotates and consumes OAuth tokens through server-side paths", () => {
    const sql = read("supabase/sql/153_mercado_pago_oauth_connection.sql");
    const credentials = read("src/server/payments/mercado-pago-credential-service.ts");
    const pix = read("src/server/payments/order-pix-service.ts");
    expect(sql).toContain("order_payment_provider_credentials_v2_internal");
    expect(sql).toContain("oauth credentials changed concurrently");
    expect(credentials).toContain("refreshMercadoPagoOAuthToken");
    expect(credentials).toContain("expectedUpdatedAt: current.updated_at");
    expect(credentials).toContain("latest.updated_at !== current.updated_at");
    expect(pix).toContain("getUsableMercadoPagoCredentials(storeId)");
  });
});
