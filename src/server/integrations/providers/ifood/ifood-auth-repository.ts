import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseIfoodApplicationCredentials,
  safeConnectionMetadata,
  type IfoodApplicationCredentials,
  type IfoodAuthMode,
  type IfoodConnectionAccount,
  type IfoodConnectionState,
  type IfoodEnvironment,
  type IfoodMerchant,
  type IfoodTokenBundle,
} from "@/server/integrations/providers/ifood/ifood-auth-model";

export class IfoodMerchantBindingConflictError extends Error {
  constructor() {
    super("This iFood merchant is already linked to another store");
    this.name = "IfoodMerchantBindingConflictError";
  }
}

type GenericHealth = IfoodConnectionAccount["status"];

type AccountRow = {
  id: string;
  organization_id: string;
  status: GenericHealth;
  environment: IfoodEnvironment;
  auth_mode: IfoodAuthMode | null;
  connection_state: IfoodConnectionState;
  metadata?: Record<string, unknown> | null;
};

type AuthorizationConsumeResult =
  | { ok: true; verifier: { authorizationCodeVerifier?: unknown }; correlationId?: string | null }
  | { ok: false; error: "not_found" | "invalid_state" | "replay" | "expired" | "verifier_missing" | string };

function dbError(error: { message?: string; code?: string | null } | null | undefined, context: string): never | void {
  if (!error) return;
  throw new Error(`${context}: ${error.message ?? "database error"}`);
}

function accountFromRow(row: AccountRow): IfoodConnectionAccount {
  if (!row.auth_mode) throw new Error("iFood account auth mode is missing");
  return {
    id: row.id,
    organizationId: row.organization_id,
    environment: row.environment,
    authMode: row.auth_mode,
    connectionState: row.connection_state,
    status: row.status,
  };
}

export class IfoodAuthRepository {
  constructor(private readonly db = createAdminClient()) {}

  async applicationCredentials(environment: IfoodEnvironment): Promise<IfoodApplicationCredentials> {
    const { data, error } = await this.db.rpc("integration_ifood_app_credentials", { p_environment: environment });
    dbError(error, "iFood application credential lookup failed");
    return parseIfoodApplicationCredentials(data);
  }

  async ensureAccount(input: {
    organizationId: string;
    environment: IfoodEnvironment;
    authMode: IfoodAuthMode;
  }): Promise<IfoodConnectionAccount> {
    const existing = await this.db
      .from("integration_accounts")
      .select("id,organization_id,status,environment,auth_mode,connection_state")
      .eq("organization_id", input.organizationId)
      .eq("provider", "ifood")
      .eq("environment", input.environment)
      .maybeSingle();
    dbError(existing.error, "iFood integration account lookup failed");

    if (existing.data) {
      const row = existing.data as AccountRow;
      if (row.auth_mode !== input.authMode) {
        const updated = await this.db
          .from("integration_accounts")
          .update({ auth_mode: input.authMode, connection_state: "starting", status: "disconnected", updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("organization_id", input.organizationId)
          .select("id,organization_id,status,environment,auth_mode,connection_state")
          .single();
        dbError(updated.error, "iFood integration account auth-mode update failed");
        return accountFromRow(updated.data as AccountRow);
      }
      return accountFromRow(row);
    }

    const created = await this.db
      .from("integration_accounts")
      .insert({
        organization_id: input.organizationId,
        provider: "ifood",
        environment: input.environment,
        auth_mode: input.authMode,
        status: "disconnected",
        connection_state: "starting",
        metadata: {},
      })
      .select("id,organization_id,status,environment,auth_mode,connection_state")
      .single();
    if (created.error?.code === "23505") {
      return this.ensureAccount(input);
    }
    dbError(created.error, "iFood integration account creation failed");
    return accountFromRow(created.data as AccountRow);
  }

  async getAccount(organizationId: string, integrationAccountId: string): Promise<IfoodConnectionAccount> {
    const result = await this.db
      .from("integration_accounts")
      .select("id,organization_id,status,environment,auth_mode,connection_state")
      .eq("id", integrationAccountId)
      .eq("organization_id", organizationId)
      .eq("provider", "ifood")
      .single();
    dbError(result.error, "iFood integration account lookup failed");
    return accountFromRow(result.data as AccountRow);
  }

  async setConnectionState(input: {
    organizationId: string;
    integrationAccountId: string;
    state: IfoodConnectionState;
    status?: GenericHealth;
    healthAt?: string | null;
    healthErrorCode?: string | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      connection_state: input.state,
      updated_at: new Date().toISOString(),
    };
    if (input.status) patch.status = input.status;
    if (input.healthAt !== undefined) patch.last_health_at = input.healthAt;
    if (input.healthErrorCode !== undefined) patch.last_health_error_code = input.healthErrorCode;
    const result = await this.db
      .from("integration_accounts")
      .update(patch)
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", "ifood");
    dbError(result.error, "iFood connection-state update failed");
  }

  async saveToken(input: {
    organizationId: string;
    integrationAccountId: string;
    token: IfoodTokenBundle;
  }): Promise<void> {
    const secret = await this.db.rpc("integration_secret_upsert", {
      p_organization_id: input.organizationId,
      p_integration_account_id: input.integrationAccountId,
      p_secret: input.token,
      p_description: "PedeAqui iFood OAuth token bundle",
    });
    dbError(secret.error, "iFood token Vault write failed");

    const current = await this.db
      .from("integration_accounts")
      .select("metadata")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .single();
    dbError(current.error, "iFood account metadata lookup failed");
    const metadata = current.data?.metadata && typeof current.data.metadata === "object" ? current.data.metadata as Record<string, unknown> : {};
    const update = await this.db
      .from("integration_accounts")
      .update({ metadata: { ...metadata, ...safeConnectionMetadata(input.token) }, updated_at: new Date().toISOString() })
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId);
    dbError(update.error, "iFood safe token metadata update failed");
  }

  async readToken(organizationId: string, integrationAccountId: string): Promise<IfoodTokenBundle | null> {
    const { data, error } = await this.db.rpc("integration_secret_read", {
      p_organization_id: organizationId,
      p_integration_account_id: integrationAccountId,
    });
    dbError(error, "iFood token Vault read failed");
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    if (typeof row.accessToken !== "string" || typeof row.expiresAt !== "string") return null;
    return {
      accessToken: row.accessToken,
      tokenType: typeof row.tokenType === "string" ? row.tokenType : "bearer",
      expiresAt: row.expiresAt,
      refreshToken: typeof row.refreshToken === "string" ? row.refreshToken : null,
    };
  }

  async clearToken(organizationId: string, integrationAccountId: string): Promise<void> {
    const { error } = await this.db.rpc("integration_secret_delete", {
      p_organization_id: organizationId,
      p_integration_account_id: integrationAccountId,
    });
    dbError(error, "iFood token Vault deletion failed");
  }

  async createAuthorizationSession(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    environment: IfoodEnvironment;
    stateHash: string;
    authorizationCodeVerifier: string;
    expiresAt: string;
    correlationId: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc("integration_authorization_session_create", {
      p_organization_id: input.organizationId,
      p_store_id: input.storeId,
      p_integration_account_id: input.integrationAccountId,
      p_environment: input.environment,
      p_state_hash: input.stateHash,
      p_verifier_secret: { authorizationCodeVerifier: input.authorizationCodeVerifier },
      p_expires_at: input.expiresAt,
      p_correlation_id: input.correlationId,
    });
    dbError(error, "iFood authorization session creation failed");
    if (typeof data !== "string") throw new Error("iFood authorization session id missing");
    return data;
  }

  async consumeAuthorizationSession(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    sessionId: string;
    stateHash: string;
  }): Promise<AuthorizationConsumeResult> {
    const { data, error } = await this.db.rpc("integration_authorization_session_consume", {
      p_organization_id: input.organizationId,
      p_store_id: input.storeId,
      p_integration_account_id: input.integrationAccountId,
      p_session_id: input.sessionId,
      p_state_hash: input.stateHash,
    });
    dbError(error, "iFood authorization session consume failed");
    return data as AuthorizationConsumeResult;
  }

  async finishAuthorizationSession(input: {
    organizationId: string;
    sessionId: string;
    status: "completed" | "cancelled" | "failed";
    errorCode?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc("integration_authorization_session_finish", {
      p_organization_id: input.organizationId,
      p_session_id: input.sessionId,
      p_status: input.status,
      p_error_code: input.errorCode ?? null,
    });
    dbError(error, "iFood authorization session finish failed");
  }

  async acquireRefreshLease(organizationId: string, integrationAccountId: string, owner: string, leaseSeconds = 60): Promise<boolean> {
    const { data, error } = await this.db.rpc("integration_acquire_refresh_lease", {
      p_organization_id: organizationId,
      p_integration_account_id: integrationAccountId,
      p_owner: owner,
      p_lease_seconds: leaseSeconds,
    });
    dbError(error, "iFood refresh lease acquisition failed");
    return data === true;
  }

  async releaseRefreshLease(organizationId: string, integrationAccountId: string, owner: string): Promise<void> {
    const { error } = await this.db.rpc("integration_release_refresh_lease", {
      p_organization_id: organizationId,
      p_integration_account_id: integrationAccountId,
      p_owner: owner,
    });
    dbError(error, "iFood refresh lease release failed");
  }

  async bindMerchant(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    environment: IfoodEnvironment;
    merchant: IfoodMerchant;
  }): Promise<string> {
    const conflict = await this.db
      .from("integration_merchants")
      .select("id,organization_id,store_id,integration_account_id")
      .eq("provider", "ifood")
      .eq("environment", input.environment)
      .eq("external_merchant_id", input.merchant.id)
      .maybeSingle();
    dbError(conflict.error, "iFood merchant ownership lookup failed");
    if (conflict.data && (
      conflict.data.organization_id !== input.organizationId ||
      conflict.data.store_id !== input.storeId ||
      conflict.data.integration_account_id !== input.integrationAccountId
    )) {
      throw new IfoodMerchantBindingConflictError();
    }

    if (conflict.data?.id) {
      const updated = await this.db
        .from("integration_merchants")
        .update({ display_name: input.merchant.name, updated_at: new Date().toISOString() })
        .eq("id", conflict.data.id)
        .eq("organization_id", input.organizationId);
      dbError(updated.error, "iFood merchant reconnection update failed");
      return String(conflict.data.id);
    }

    const existingStore = await this.db
      .from("integration_merchants")
      .select("id,external_merchant_id")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("provider", "ifood")
      .eq("environment", input.environment)
      .maybeSingle();
    dbError(existingStore.error, "iFood store merchant lookup failed");
    if (existingStore.data?.id && existingStore.data.external_merchant_id !== input.merchant.id) {
      throw new IfoodMerchantBindingConflictError();
    }

    const created = await this.db
      .from("integration_merchants")
      .insert({
        organization_id: input.organizationId,
        store_id: input.storeId,
        integration_account_id: input.integrationAccountId,
        provider: "ifood",
        environment: input.environment,
        external_merchant_id: input.merchant.id,
        display_name: input.merchant.name,
      })
      .select("id")
      .single();
    if (created.error?.code === "23505") throw new IfoodMerchantBindingConflictError();
    dbError(created.error, "iFood merchant binding failed");
    return String(created.data.id);
  }

  async audit(input: {
    organizationId: string;
    storeId?: string | null;
    integrationAccountId?: string | null;
    actorUserId?: string | null;
    action: string;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const result = await this.db.from("integration_audit_log").insert({
      organization_id: input.organizationId,
      store_id: input.storeId ?? null,
      integration_account_id: input.integrationAccountId ?? null,
      actor_user_id: input.actorUserId ?? null,
      provider: "ifood",
      capability: null,
      action: input.action,
      source: input.actorUserId ? "user_action" : "server",
      correlation_id: input.correlationId ?? randomUUID(),
      metadata: input.metadata ?? {},
    });
    dbError(result.error, "iFood audit write failed");
  }
}
