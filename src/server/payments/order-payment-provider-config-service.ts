import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export const orderPaymentProviderSchema = z.literal("mercado_pago");
export type OrderPaymentProviderKey = z.infer<typeof orderPaymentProviderSchema>;

const environmentSchema = z.enum(["test", "production"]);

export type OnlinePixConfigView = {
  provider: OrderPaymentProviderKey;
  environment: "test" | "production";
  enabled: boolean;
  credentialsConfigured: boolean;
  healthStatus: "unknown" | "healthy" | "error";
  healthCheckedAt: string | null;
  errorCode: string | null;
};

type Credentials = {
  organization_id: string;
  store_id: string;
  provider: OrderPaymentProviderKey;
  environment: "test" | "production";
  enabled: boolean;
  access_token: string;
  webhook_secret: string;
};

export class OrderPaymentProviderConfigService {
  static async getForStore(organizationId: string, storeId: string): Promise<OnlinePixConfigView | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from("order_payment_provider_configs")
      .select("provider, environment, enabled, access_token_secret_id, webhook_secret_id, last_health_status, last_health_checked_at, last_error_code")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("provider", "mercado_pago")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      provider: orderPaymentProviderSchema.parse(data.provider),
      environment: environmentSchema.parse(data.environment),
      enabled: Boolean(data.enabled),
      credentialsConfigured: Boolean(data.access_token_secret_id && data.webhook_secret_id),
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
    return Boolean(config?.enabled && config.credentialsConfigured);
  }

  static async configureCurrentStore(input: {
    enabled: boolean;
    environment: "test" | "production";
    accessToken?: string | null;
    webhookSecret?: string | null;
  }) {
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const environment = environmentSchema.parse(input.environment);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_configure_internal", {
      p_store_id: context.storeId,
      p_provider: "mercado_pago",
      p_environment: environment,
      p_enabled: Boolean(input.enabled),
      p_access_token: input.accessToken?.trim() || null,
      p_webhook_secret: input.webhookSecret?.trim() || null,
    });
    if (error) throw error;
    return data;
  }

  static async credentials(storeId: string, provider: OrderPaymentProviderKey = "mercado_pago"): Promise<Credentials | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("order_payment_provider_credentials_internal", {
      p_store_id: storeId,
      p_provider: provider,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const parsed = z.object({
      organization_id: z.string().uuid(),
      store_id: z.string().uuid(),
      provider: orderPaymentProviderSchema,
      environment: environmentSchema,
      enabled: z.boolean(),
      access_token: z.string().min(1),
      webhook_secret: z.string().min(1),
    }).parse(row);
    return parsed;
  }
}
