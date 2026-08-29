import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export const orderPaymentProviderSchema = z.literal("mercado_pago");
export type OrderPaymentProviderKey = z.infer<typeof orderPaymentProviderSchema>;

const environmentSchema = z.enum(["test", "production"]);
const connectionModeSchema = z.enum(["manual", "oauth"]);
const healthErrorCodeSchema = z.enum([
  "mercado_pago_auth_failed",
  "mercado_pago_provider_unavailable",
  "mercado_pago_request_failed",
  "reconciliation_failed",
]);
export type OrderPaymentProviderHealthErrorCode = z.infer<typeof healthErrorCodeSchema>;

export type OnlinePixConfigView = {
  provider: OrderPaymentProviderKey;
  environment: "test" | "production";
  enabled: boolean;
  connectionMode: "manual" | "oauth";
  credentialsConfigured: boolean;
  providerAccountId: string | null;
  accessTokenExpiresAt: string | null;
  authorizedAt: string | null;
  revokedAt: string | null;
  healthStatus: "unknown" | "healthy" | "error";
  healthCheckedAt: string | null;
  errorCode: string | null;
};

export type OrderPaymentProviderCredentials = {
  organization_id: string;
  store_id: string;
  provider: OrderPaymentProviderKey;
  environment: "test" | "production";
  enabled: boolean;
  connection_mode: "manual" | "oauth";
  provider_account_id: string | null;
  access_token: string;
  refresh_token: string | null;
  webhook_secret: string;
  access_token_expires_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
  updated_at: string;
};

export class OrderPaymentProviderConfigService {
  static async getForStore(organizationId: string, storeId: string): Promise<OnlinePixConfigView | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from("order_payment_provider_configs")
      .select("provider, environment, enabled, connection_mode, provider_account_id, access_token_secret_id, refresh_token_secret_id, webhook_secret_id, access_token_expires_at, authorized_at, revoked_at, last_health_status, last_health_checked_at, last_error_code")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("provider", "mercado_pago")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const connectionMode = connectionModeSchema.parse(data.connection_mode ?? "manual");
    const credentialsConfigured = connectionMode === "oauth"
      ? Boolean(data.access_token_secret_id && data.refresh_token_secret_id && data.webhook_secret_id && !data.revoked_at)
      : Boolean(data.access_token_secret_id && data.webhook_secret_id);
    return {
      provider: orderPaymentProviderSchema.parse(data.provider),
      environment: environmentSchema.parse(data.environment),
      enabled: Boolean(data.enabled),
      connectionMode,
      credentialsConfigured,
      providerAccountId: data.provider_account_id ?? null,
      accessTokenExpiresAt: data.access_token_expires_at ?? null,
      authorizedAt: data.authorized_at ?? null,
      revokedAt: data.revoked_at ?? null,
      healthStatus: z.enum(["unknown", "healthy", "error"]).parse(data.last_health_status),
      healthCheckedAt: data.last_health_checked_at ?? null,
      errorCode: data.last_error_code ?? null,
    };
  }

  static async getCurrentStore() {
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    return {
      context,
      config: await this.getForStore(context.organizationId, context.storeId),
    };
  }

  static async isOnlinePixReady(organizationId: string, storeId: string) {
    const config = await this.getForStore(organizationId, storeId);
    return Boolean(config?.enabled && config.credentialsConfigured && !config.revokedAt);
  }

  static async configureCurrentStore(input: {
    enabled: boolean;
    environment: "test" | "production";
    accessToken?: string | null;
    webhookSecret?: string | null;
  }) {
    const { context, config } = await this.getCurrentStore();
    if (config?.connectionMode === "oauth" && !config.revokedAt) {
      throw new Error("Disconnect Mercado Pago OAuth before using manual credentials");
    }
    const environment = environmentSchema.parse(input.environment);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_configure_manual_internal", {
      p_store_id: context.storeId,
      p_environment: environment,
      p_enabled: Boolean(input.enabled),
      p_access_token: input.accessToken?.trim() || null,
      p_webhook_secret: input.webhookSecret?.trim() || null,
    });
    if (error) throw error;
    return data;
  }

  static async setCurrentStoreEnabled(enabled: boolean) {
    const { context, config } = await this.getCurrentStore();
    if (!config?.credentialsConfigured) throw new Error("Mercado Pago credentials are not configured");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_configure_internal", {
      p_store_id: context.storeId,
      p_provider: "mercado_pago",
      p_environment: config.environment,
      p_enabled: Boolean(enabled),
      p_access_token: null,
      p_webhook_secret: null,
    });
    if (error) throw error;
    return data;
  }

  static async connectOAuthCurrentStore(input: {
    environment: "test" | "production";
    accessToken: string;
    refreshToken: string;
    webhookSecret: string;
    providerAccountId: string;
    accessTokenExpiresAt: string;
  }) {
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_oauth_connect_internal", {
      p_store_id: context.storeId,
      p_environment: environmentSchema.parse(input.environment),
      p_access_token: input.accessToken,
      p_refresh_token: input.refreshToken,
      p_webhook_secret: input.webhookSecret,
      p_provider_account_id: input.providerAccountId,
      p_access_token_expires_at: input.accessTokenExpiresAt,
    });
    if (error) throw error;
    return data;
  }

  static async disconnectOAuthCurrentStore() {
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_oauth_disconnect_internal", {
      p_store_id: context.storeId,
    });
    if (error) throw error;
    return data;
  }

  static async credentials(storeId: string, provider: OrderPaymentProviderKey = "mercado_pago"): Promise<OrderPaymentProviderCredentials | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_credentials_v2_internal", {
      p_store_id: storeId,
      p_provider: provider,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return z.object({
      organization_id: z.string().uuid(),
      store_id: z.string().uuid(),
      provider: orderPaymentProviderSchema,
      environment: environmentSchema,
      enabled: z.boolean(),
      connection_mode: connectionModeSchema,
      provider_account_id: z.string().nullable(),
      access_token: z.string().min(1),
      refresh_token: z.string().nullable(),
      webhook_secret: z.string().min(1),
      access_token_expires_at: z.string().nullable(),
      authorized_at: z.string().nullable(),
      revoked_at: z.string().nullable(),
      updated_at: z.string(),
    }).parse(row);
  }

  static async persistOAuthRefresh(input: {
    storeId: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    expectedUpdatedAt: string;
  }) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_oauth_refresh_internal", {
      p_store_id: input.storeId,
      p_access_token: input.accessToken,
      p_refresh_token: input.refreshToken,
      p_access_token_expires_at: input.accessTokenExpiresAt,
      p_expected_updated_at: input.expectedUpdatedAt,
    });
    if (error) throw error;
    return data;
  }

  static async recordHealth(storeId: string, input: {
    status: "healthy" | "error";
    errorCode?: OrderPaymentProviderHealthErrorCode | null;
  }) {
    const admin = createAdminClient();
    const checkedAt = new Date().toISOString();
    const errorCode = input.status === "healthy"
      ? null
      : healthErrorCodeSchema.parse(input.errorCode ?? "mercado_pago_request_failed");
    const { error } = await admin.from("order_payment_provider_configs")
      .update({
        last_health_status: input.status,
        last_health_checked_at: checkedAt,
        last_error_code: errorCode,
      })
      .eq("store_id", storeId)
      .eq("provider", "mercado_pago");
    if (error) throw error;
  }
}
