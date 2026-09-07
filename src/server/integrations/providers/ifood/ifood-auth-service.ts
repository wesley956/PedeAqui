import { randomUUID } from "node:crypto";
import {
  generateAuthorizationState,
  hashAuthorizationState,
  safeConnectionMetadata,
  sanitizeIfoodError,
  tokenExpiresAt,
  tokenNeedsRefresh,
  type IfoodApplicationCredentials,
  type IfoodConnectionAccount,
  type IfoodEnvironment,
  type IfoodMerchant,
  type IfoodMerchantHealth,
  type IfoodMerchantSelection,
  type IfoodStartConnectionResult,
  type IfoodTokenBundle,
} from "@/server/integrations/providers/ifood/ifood-auth-model";

export type IfoodAuthorizationConsumeResult =
  | { ok: true; verifier: { authorizationCodeVerifier?: unknown }; correlationId?: string | null }
  | { ok: false; error: string };

export interface IfoodAuthRepositoryPort {
  applicationCredentials(environment: IfoodEnvironment): Promise<IfoodApplicationCredentials>;
  ensureAccount(input: { organizationId: string; environment: IfoodEnvironment; authMode: IfoodApplicationCredentials["authMode"] }): Promise<IfoodConnectionAccount>;
  getAccount(organizationId: string, integrationAccountId: string): Promise<IfoodConnectionAccount>;
  setConnectionState(input: {
    organizationId: string;
    integrationAccountId: string;
    state: IfoodConnectionAccount["connectionState"];
    status?: IfoodConnectionAccount["status"];
    healthAt?: string | null;
    healthErrorCode?: string | null;
  }): Promise<void>;
  saveToken(input: { organizationId: string; integrationAccountId: string; token: IfoodTokenBundle }): Promise<void>;
  readToken(organizationId: string, integrationAccountId: string): Promise<IfoodTokenBundle | null>;
  clearToken(organizationId: string, integrationAccountId: string): Promise<void>;
  createAuthorizationSession(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    environment: IfoodEnvironment;
    stateHash: string;
    authorizationCodeVerifier: string;
    expiresAt: string;
    correlationId: string;
  }): Promise<string>;
  consumeAuthorizationSession(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    sessionId: string;
    stateHash: string;
  }): Promise<IfoodAuthorizationConsumeResult>;
  finishAuthorizationSession(input: {
    organizationId: string;
    sessionId: string;
    status: "completed" | "cancelled" | "failed";
    errorCode?: string | null;
  }): Promise<void>;
  acquireRefreshLease(organizationId: string, integrationAccountId: string, owner: string, leaseSeconds?: number): Promise<boolean>;
  releaseRefreshLease(organizationId: string, integrationAccountId: string, owner: string): Promise<void>;
  bindMerchant(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    environment: IfoodEnvironment;
    merchant: IfoodMerchant;
  }): Promise<string>;
  audit(input: {
    organizationId: string;
    storeId?: string | null;
    integrationAccountId?: string | null;
    actorUserId?: string | null;
    action: string;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface IfoodAuthHttpPort {
  exchangeClientCredentials(credentials: IfoodApplicationCredentials): Promise<IfoodTokenBundle>;
  requestUserCode(clientId: string): Promise<{
    userCode: string;
    authorizationCodeVerifier: string;
    verificationUrl: string | null;
    verificationUrlComplete: string;
    expiresIn: number;
  }>;
  exchangeAuthorizationCode(input: {
    credentials: IfoodApplicationCredentials;
    authorizationCode: string;
    authorizationCodeVerifier: string;
  }): Promise<IfoodTokenBundle>;
  refreshToken(credentials: IfoodApplicationCredentials, refreshToken: string): Promise<IfoodTokenBundle>;
  listMerchants(accessToken: string): Promise<IfoodMerchant[]>;
  getMerchant(accessToken: string, merchantId: string): Promise<IfoodMerchant>;
  getMerchantHealth(accessToken: string, merchantId: string): Promise<IfoodMerchantHealth>;
}

export class IfoodAuthorizationSessionError extends Error {
  constructor(readonly code: string) {
    super(`iFood authorization session failed: ${code}`);
    this.name = "IfoodAuthorizationSessionError";
  }
}

export class IfoodRefreshInProgressError extends Error {
  constructor() {
    super("iFood token refresh is already in progress");
    this.name = "IfoodRefreshInProgressError";
  }
}

function retryableProviderFailure(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "retryable" in error && (error as { retryable?: unknown }).retryable === true);
}

function providerErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code: string }).code).slice(0, 80);
  }
  return "ifood_provider_error";
}

function merchantSelection(integrationAccountId: string, merchants: IfoodMerchant[]): IfoodMerchantSelection {
  return { kind: "merchant_selection", integrationAccountId, merchants };
}

export class IfoodAuthService {
  constructor(
    private readonly repository: IfoodAuthRepositoryPort,
    private readonly http: IfoodAuthHttpPort,
    private readonly now: () => number = Date.now,
  ) {}

  async startConnection(input: {
    organizationId: string;
    storeId: string;
    environment: IfoodEnvironment;
    actorUserId?: string | null;
  }): Promise<IfoodStartConnectionResult> {
    const credentials = await this.repository.applicationCredentials(input.environment);
    const account = await this.repository.ensureAccount({
      organizationId: input.organizationId,
      environment: input.environment,
      authMode: credentials.authMode,
    });
    const correlationId = randomUUID();

    await this.repository.audit({
      organizationId: input.organizationId,
      storeId: input.storeId,
      integrationAccountId: account.id,
      actorUserId: input.actorUserId ?? null,
      action: "ifood.connection.started",
      correlationId,
      metadata: { environment: input.environment, authMode: credentials.authMode },
    });

    if (credentials.authMode === "centralized") {
      try {
        await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: account.id, state: "exchanging_token", status: "disconnected" });
        const token = await this.http.exchangeClientCredentials(credentials);
        await this.repository.saveToken({ organizationId: input.organizationId, integrationAccountId: account.id, token });
        await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: account.id, state: "resolving_merchant", status: "disconnected" });
        const merchants = await this.http.listMerchants(token.accessToken);
        await this.repository.audit({
          organizationId: input.organizationId,
          storeId: input.storeId,
          integrationAccountId: account.id,
          actorUserId: input.actorUserId ?? null,
          action: "ifood.token.exchanged",
          correlationId,
          metadata: { ...safeConnectionMetadata(token), merchantCount: merchants.length, authMode: "centralized" },
        });
        return merchantSelection(account.id, merchants);
      } catch (error) {
        await this.markProviderFailure(input.organizationId, account.id, error);
        throw error;
      }
    }

    try {
      const userCode = await this.http.requestUserCode(credentials.clientId);
      const state = generateAuthorizationState();
      const expiresAt = tokenExpiresAt(userCode.expiresIn, this.now());
      const sessionId = await this.repository.createAuthorizationSession({
        organizationId: input.organizationId,
        storeId: input.storeId,
        integrationAccountId: account.id,
        environment: input.environment,
        stateHash: state.stateHash,
        authorizationCodeVerifier: userCode.authorizationCodeVerifier,
        expiresAt,
        correlationId,
      });
      await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: account.id, state: "awaiting_authorization", status: "disconnected" });
      return {
        kind: "authorization_required",
        integrationAccountId: account.id,
        sessionId,
        state: state.state,
        userCode: userCode.userCode,
        verificationUrl: userCode.verificationUrl,
        verificationUrlComplete: userCode.verificationUrlComplete,
        expiresAt,
      };
    } catch (error) {
      await this.markProviderFailure(input.organizationId, account.id, error);
      throw error;
    }
  }

  async completeDistributedAuthorization(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    sessionId: string;
    state: string;
    authorizationCode: string;
    actorUserId?: string | null;
  }): Promise<IfoodMerchantSelection> {
    const account = await this.repository.getAccount(input.organizationId, input.integrationAccountId);
    if (account.authMode !== "distributed") throw new IfoodAuthorizationSessionError("wrong_auth_mode");

    const consumed = await this.repository.consumeAuthorizationSession({
      organizationId: input.organizationId,
      storeId: input.storeId,
      integrationAccountId: input.integrationAccountId,
      sessionId: input.sessionId,
      stateHash: hashAuthorizationState(input.state),
    });
    if (!consumed.ok) throw new IfoodAuthorizationSessionError(consumed.error);
    const verifier = consumed.verifier.authorizationCodeVerifier;
    if (typeof verifier !== "string" || verifier.length === 0) throw new IfoodAuthorizationSessionError("verifier_missing");

    const credentials = await this.repository.applicationCredentials(account.environment);
    await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: account.id, state: "exchanging_token", status: "disconnected" });
    try {
      const token = await this.http.exchangeAuthorizationCode({ credentials, authorizationCode: input.authorizationCode, authorizationCodeVerifier: verifier });
      await this.repository.saveToken({ organizationId: input.organizationId, integrationAccountId: account.id, token });
      await this.repository.finishAuthorizationSession({ organizationId: input.organizationId, sessionId: input.sessionId, status: "completed" });
      await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: account.id, state: "resolving_merchant", status: "disconnected" });
      const merchants = await this.http.listMerchants(token.accessToken);
      await this.repository.audit({
        organizationId: input.organizationId,
        storeId: input.storeId,
        integrationAccountId: account.id,
        actorUserId: input.actorUserId ?? null,
        action: "ifood.authorization.completed",
        correlationId: consumed.correlationId ?? null,
        metadata: { ...safeConnectionMetadata(token), merchantCount: merchants.length, authMode: "distributed" },
      });
      return merchantSelection(account.id, merchants);
    } catch (error) {
      if (!retryableProviderFailure(error)) {
        await this.repository.finishAuthorizationSession({ organizationId: input.organizationId, sessionId: input.sessionId, status: "failed", errorCode: providerErrorCode(error) });
      }
      await this.markProviderFailure(input.organizationId, account.id, error);
      throw error;
    }
  }

  async validAccessToken(organizationId: string, integrationAccountId: string): Promise<string> {
    const account = await this.repository.getAccount(organizationId, integrationAccountId);
    const current = await this.repository.readToken(organizationId, integrationAccountId);
    if (!tokenNeedsRefresh(current, this.now())) return current!.accessToken;

    const owner = randomUUID();
    const acquired = await this.repository.acquireRefreshLease(organizationId, integrationAccountId, owner, 60);
    if (!acquired) {
      const afterLease = await this.repository.readToken(organizationId, integrationAccountId);
      if (!tokenNeedsRefresh(afterLease, this.now())) return afterLease!.accessToken;
      throw new IfoodRefreshInProgressError();
    }

    try {
      const latest = await this.repository.readToken(organizationId, integrationAccountId);
      if (!tokenNeedsRefresh(latest, this.now())) return latest!.accessToken;
      const credentials = await this.repository.applicationCredentials(account.environment);
      let next: IfoodTokenBundle;
      if (account.authMode === "distributed") {
        if (!latest?.refreshToken) {
          await this.repository.setConnectionState({ organizationId, integrationAccountId, state: "action_required", status: "action_required", healthErrorCode: "refresh_token_missing" });
          throw new IfoodAuthorizationSessionError("refresh_token_missing");
        }
        next = await this.http.refreshToken(credentials, latest.refreshToken);
      } else {
        next = await this.http.exchangeClientCredentials(credentials);
      }
      await this.repository.saveToken({ organizationId, integrationAccountId, token: next });
      await this.repository.audit({
        organizationId,
        integrationAccountId,
        action: "ifood.token.refreshed",
        metadata: { ...safeConnectionMetadata(next), authMode: account.authMode },
      });
      return next.accessToken;
    } catch (error) {
      await this.markProviderFailure(organizationId, integrationAccountId, error);
      throw error;
    } finally {
      await this.repository.releaseRefreshLease(organizationId, integrationAccountId, owner);
    }
  }

  async bindMerchantAndCheckHealth(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    merchantId: string;
    actorUserId?: string | null;
  }): Promise<{ merchantBindingId: string; merchant: IfoodMerchant; health: IfoodMerchantHealth }> {
    const account = await this.repository.getAccount(input.organizationId, input.integrationAccountId);
    const accessToken = await this.validAccessToken(input.organizationId, input.integrationAccountId);
    await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: account.id, state: "health_checking", status: "disconnected" });
    try {
      const merchant = await this.http.getMerchant(accessToken, input.merchantId);
      const merchantBindingId = await this.repository.bindMerchant({
        organizationId: input.organizationId,
        storeId: input.storeId,
        integrationAccountId: input.integrationAccountId,
        environment: account.environment,
        merchant,
      });
      const health = await this.http.getMerchantHealth(accessToken, merchant.id);
      const operationalAttention = health.available === false;
      const checkedAt = new Date(this.now()).toISOString();
      await this.repository.setConnectionState({
        organizationId: input.organizationId,
        integrationAccountId: account.id,
        state: "connected",
        status: operationalAttention ? "attention" : "connected",
        healthAt: checkedAt,
        healthErrorCode: null,
      });
      await this.repository.audit({
        organizationId: input.organizationId,
        storeId: input.storeId,
        integrationAccountId: account.id,
        actorUserId: input.actorUserId ?? null,
        action: "ifood.merchant.connected",
        metadata: { merchantId: merchant.id, environment: account.environment, available: health.available ?? null },
      });
      return { merchantBindingId, merchant, health };
    } catch (error) {
      await this.markProviderFailure(input.organizationId, account.id, error);
      throw error;
    }
  }

  async disconnect(input: {
    organizationId: string;
    storeId?: string | null;
    integrationAccountId: string;
    actorUserId?: string | null;
  }): Promise<void> {
    await this.repository.clearToken(input.organizationId, input.integrationAccountId);
    await this.repository.setConnectionState({ organizationId: input.organizationId, integrationAccountId: input.integrationAccountId, state: "disconnected", status: "disconnected", healthErrorCode: null });
    await this.repository.audit({
      organizationId: input.organizationId,
      storeId: input.storeId ?? null,
      integrationAccountId: input.integrationAccountId,
      actorUserId: input.actorUserId ?? null,
      action: "ifood.connection.disconnected",
      metadata: {},
    });
  }

  private async markProviderFailure(organizationId: string, integrationAccountId: string, error: unknown): Promise<void> {
    const retryable = retryableProviderFailure(error);
    await this.repository.setConnectionState({
      organizationId,
      integrationAccountId,
      state: retryable ? "temporarily_unavailable" : "action_required",
      status: retryable ? "unavailable" : "action_required",
      healthErrorCode: providerErrorCode(error),
    });
    await this.repository.audit({
      organizationId,
      integrationAccountId,
      action: "ifood.connection.failure",
      metadata: { retryable, code: providerErrorCode(error), message: sanitizeIfoodError(error) },
    });
  }
}
