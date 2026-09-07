import { describe, expect, it } from "vitest";
import {
  IfoodAuthService,
  IfoodAuthorizationSessionError,
  IfoodRefreshInProgressError,
  type IfoodAuthHttpPort,
  type IfoodAuthRepositoryPort,
  type IfoodAuthorizationConsumeResult,
} from "@/server/integrations/providers/ifood/ifood-auth-service";
import type {
  IfoodApplicationCredentials,
  IfoodConnectionAccount,
  IfoodEnvironment,
  IfoodMerchant,
  IfoodMerchantHealth,
  IfoodTokenBundle,
} from "@/server/integrations/providers/ifood/ifood-auth-model";

const future = "2026-09-07T18:00:00.000Z";
const expired = "2026-09-07T12:00:00.000Z";

class FakeRepository implements IfoodAuthRepositoryPort {
  credentials: IfoodApplicationCredentials = { clientId: "client-123456", clientSecret: "secret-123456", authMode: "distributed" };
  account: IfoodConnectionAccount = { id: "account-1", organizationId: "org-1", environment: "sandbox", authMode: "distributed", connectionState: "starting", status: "disconnected" };
  token: IfoodTokenBundle | null = null;
  consume: IfoodAuthorizationConsumeResult = { ok: true, verifier: { authorizationCodeVerifier: "verifier-secret" }, correlationId: "corr-1" };
  leaseAvailable = true;
  leaseOwner: string | null = null;
  sessionCreates = 0;
  stateUpdates: Array<Record<string, unknown>> = [];
  audits: Array<Record<string, unknown>> = [];
  savedTokens: IfoodTokenBundle[] = [];
  merchantBindings: IfoodMerchant[] = [];

  async applicationCredentials(_environment: IfoodEnvironment) { return this.credentials; }
  async ensureAccount(input: { organizationId: string; environment: IfoodEnvironment; authMode: IfoodApplicationCredentials["authMode"] }) {
    this.account = { ...this.account, organizationId: input.organizationId, environment: input.environment, authMode: input.authMode };
    return this.account;
  }
  async getAccount() { return this.account; }
  async setConnectionState(input: Record<string, unknown>) { this.stateUpdates.push(input); }
  async saveToken(input: { token: IfoodTokenBundle }) { this.token = input.token; this.savedTokens.push(input.token); }
  async readToken() { return this.token; }
  async clearToken() { this.token = null; }
  async createAuthorizationSession() { this.sessionCreates += 1; return `session-${this.sessionCreates}`; }
  async consumeAuthorizationSession() { return this.consume; }
  async finishAuthorizationSession() {}
  async acquireRefreshLease(_organizationId: string, _accountId: string, owner: string) {
    if (!this.leaseAvailable || this.leaseOwner) return false;
    this.leaseOwner = owner;
    return true;
  }
  async releaseRefreshLease(_organizationId: string, _accountId: string, owner: string) {
    if (this.leaseOwner === owner) this.leaseOwner = null;
  }
  async bindMerchant(input: { merchant: IfoodMerchant }) { this.merchantBindings.push(input.merchant); return "binding-1"; }
  async audit(input: Record<string, unknown>) { this.audits.push(input); }
}

class FakeHttp implements IfoodAuthHttpPort {
  clientCredentialsCalls = 0;
  userCodeCalls = 0;
  authorizationCodeCalls = 0;
  refreshCalls = 0;
  merchantListCalls = 0;
  token: IfoodTokenBundle = { accessToken: "access-token-secret-value", tokenType: "bearer", expiresAt: future, refreshToken: "refresh-token-secret-value" };
  merchants: IfoodMerchant[] = [{ id: "merchant-1", name: "Loja iFood" }];
  health: IfoodMerchantHealth = { available: true, state: "OK" };

  async exchangeClientCredentials() { this.clientCredentialsCalls += 1; return this.token; }
  async requestUserCode() {
    this.userCodeCalls += 1;
    return { userCode: "ABCD-EFGH", authorizationCodeVerifier: "verifier-secret", verificationUrl: "https://example.test", verificationUrlComplete: "https://example.test/code", expiresIn: 600 };
  }
  async exchangeAuthorizationCode() { this.authorizationCodeCalls += 1; return this.token; }
  async refreshToken() { this.refreshCalls += 1; return this.token; }
  async listMerchants() { this.merchantListCalls += 1; return this.merchants; }
  async getMerchant(_token: string, merchantId: string) { return { id: merchantId, name: "Loja iFood" }; }
  async getMerchantHealth() { return this.health; }
}

function service(repo = new FakeRepository(), http = new FakeHttp()) {
  return { repo, http, service: new IfoodAuthService(repo, http, () => Date.parse("2026-09-07T13:00:00.000Z")) };
}

describe("IfoodAuthService", () => {
  it("starts distributed auth with one-time state and never audits verifier/secrets", async () => {
    const ctx = service();
    const result = await ctx.service.startConnection({ organizationId: "org-1", storeId: "store-1", environment: "sandbox", actorUserId: "user-1" });
    expect(result.kind).toBe("authorization_required");
    if (result.kind !== "authorization_required") return;
    expect(result.state).not.toBe("");
    expect(result.expiresAt).toBe("2026-09-07T13:10:00.000Z");
    expect(ctx.repo.sessionCreates).toBe(1);
    const audit = JSON.stringify(ctx.repo.audits);
    expect(audit).not.toContain("verifier-secret");
    expect(audit).not.toContain("secret-123456");
    expect(audit).not.toContain("access-token-secret-value");
  });

  it("rejects invalid/replayed authorization state before token exchange", async () => {
    const ctx = service();
    ctx.repo.consume = { ok: false, error: "replay" };
    await expect(ctx.service.completeDistributedAuthorization({
      organizationId: "org-1", storeId: "store-1", integrationAccountId: "account-1", sessionId: "session-1", state: "state", authorizationCode: "code",
    })).rejects.toBeInstanceOf(IfoodAuthorizationSessionError);
    expect(ctx.http.authorizationCodeCalls).toBe(0);
  });

  it("centralized auth exchanges credentials and stops at merchant selection without enabling capabilities", async () => {
    const ctx = service();
    ctx.repo.credentials = { ...ctx.repo.credentials, authMode: "centralized" };
    const result = await ctx.service.startConnection({ organizationId: "org-1", storeId: "store-1", environment: "sandbox" });
    expect(result.kind).toBe("merchant_selection");
    expect(ctx.http.clientCredentialsCalls).toBe(1);
    expect(ctx.http.merchantListCalls).toBe(1);
    expect(ctx.repo.stateUpdates.at(-1)).toMatchObject({ state: "resolving_merchant", status: "disconnected" });
    expect(JSON.stringify(ctx.repo.audits)).not.toContain("access-token-secret-value");
    expect(JSON.stringify(ctx.repo.audits)).not.toContain("refresh-token-secret-value");
  });

  it("completes distributed authorization and persists token before merchant selection", async () => {
    const ctx = service();
    const result = await ctx.service.completeDistributedAuthorization({
      organizationId: "org-1", storeId: "store-1", integrationAccountId: "account-1", sessionId: "session-1", state: "state", authorizationCode: "auth-code", actorUserId: "user-1",
    });
    expect(result.merchants).toHaveLength(1);
    expect(ctx.http.authorizationCodeCalls).toBe(1);
    expect(ctx.repo.savedTokens).toHaveLength(1);
    expect(ctx.repo.stateUpdates.at(-1)).toMatchObject({ state: "resolving_merchant", status: "disconnected" });
  });

  it("uses a refresh lease so a second worker cannot start another refresh", async () => {
    const ctx = service();
    ctx.repo.token = { accessToken: "expired-access", tokenType: "bearer", expiresAt: expired, refreshToken: "refresh-old" };
    ctx.repo.leaseAvailable = false;
    await expect(ctx.service.validAccessToken("org-1", "account-1")).rejects.toBeInstanceOf(IfoodRefreshInProgressError);
    expect(ctx.http.refreshCalls).toBe(0);
  });

  it("refreshes distributed token once under the lease and releases it", async () => {
    const ctx = service();
    ctx.repo.token = { accessToken: "expired-access", tokenType: "bearer", expiresAt: expired, refreshToken: "refresh-old" };
    const access = await ctx.service.validAccessToken("org-1", "account-1");
    expect(access).toBe("access-token-secret-value");
    expect(ctx.http.refreshCalls).toBe(1);
    expect(ctx.repo.leaseOwner).toBeNull();
  });

  it("marks connection connected only after authoritative merchant lookup and health check", async () => {
    const ctx = service();
    ctx.repo.token = { accessToken: "still-valid", tokenType: "bearer", expiresAt: future, refreshToken: "refresh" };
    const result = await ctx.service.bindMerchantAndCheckHealth({ organizationId: "org-1", storeId: "store-1", integrationAccountId: "account-1", merchantId: "merchant-1" });
    expect(result.merchant.id).toBe("merchant-1");
    expect(ctx.repo.merchantBindings).toHaveLength(1);
    expect(ctx.repo.stateUpdates.at(-1)).toMatchObject({ state: "connected", status: "connected", healthErrorCode: null });
  });

  it("disconnects by deleting token material without deleting merchant history", async () => {
    const ctx = service();
    ctx.repo.token = { accessToken: "valid", tokenType: "bearer", expiresAt: future, refreshToken: "refresh" };
    ctx.repo.merchantBindings.push({ id: "merchant-1", name: "Loja" });
    await ctx.service.disconnect({ organizationId: "org-1", storeId: "store-1", integrationAccountId: "account-1" });
    expect(ctx.repo.token).toBeNull();
    expect(ctx.repo.merchantBindings).toHaveLength(1);
    expect(ctx.repo.stateUpdates.at(-1)).toMatchObject({ state: "disconnected", status: "disconnected" });
  });
});
