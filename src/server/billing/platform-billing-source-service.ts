import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUsableMercadoPagoCredentials } from "@/server/payments/mercado-pago-credential-service";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";

const SOURCE_KEY = "billing.mercado_pago.source";

const sourceValueSchema = z.object({
  enabled: z.boolean().default(false),
  source_store_id: z.string().uuid().optional(),
  source_organization_id: z.string().uuid().optional(),
  provider_account_id: z.string().nullable().optional(),
  connection_mode: z.literal("oauth").optional(),
  environment: z.literal("production").optional(),
  source_owner_email: z.string().email().optional(),
}).passthrough();

async function readSourceSetting() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_settings")
    .select("active,value")
    .eq("key", SOURCE_KEY)
    .maybeSingle();
  if (error) throw error;
  const value = sourceValueSchema.parse(data?.value ?? { enabled: false });
  return { active: Boolean(data?.active), value };
}

export class PlatformBillingSourceService {
  static async configuration() {
    const source = await readSourceSetting();
    const storeId = source.value.source_store_id ?? null;
    const organizationId = source.value.source_organization_id ?? null;
    if (!source.active || !storeId || !organizationId) {
      return {
        configured: false,
        enabled: false,
        sourceStoreId: storeId,
        sourceOrganizationId: organizationId,
        sourceOwnerEmail: source.value.source_owner_email ?? null,
        providerAccountId: source.value.provider_account_id ?? null,
        credentialsReady: false,
        healthStatus: "unknown" as const,
        revokedAt: null as string | null,
      };
    }

    const config = await OrderPaymentProviderConfigService.getForStore(organizationId, storeId);
    const matchesExpectedAccount = !source.value.provider_account_id || config?.providerAccountId === source.value.provider_account_id;
    const credentialsReady = Boolean(
      config?.enabled &&
      config.credentialsConfigured &&
      config.connectionMode === "oauth" &&
      config.environment === "production" &&
      !config.revokedAt &&
      matchesExpectedAccount,
    );

    return {
      configured: Boolean(config),
      enabled: source.value.enabled === true && credentialsReady,
      sourceStoreId: storeId,
      sourceOrganizationId: organizationId,
      sourceOwnerEmail: source.value.source_owner_email ?? null,
      providerAccountId: config?.providerAccountId ?? source.value.provider_account_id ?? null,
      credentialsReady,
      healthStatus: config?.healthStatus ?? "unknown",
      revokedAt: config?.revokedAt ?? null,
    };
  }

  static async credentials(options: { requireBillingEnabled?: boolean } = {}) {
    const source = await readSourceSetting();
    if (!source.active) throw new Error("PedeAqui billing Mercado Pago source is inactive");
    if (options.requireBillingEnabled !== false && source.value.enabled !== true) {
      throw new Error("PedeAqui subscription billing is disabled");
    }
    const storeId = source.value.source_store_id;
    const organizationId = source.value.source_organization_id;
    if (!storeId || !organizationId) throw new Error("PedeAqui billing Mercado Pago source is not configured");

    const credentials = await getUsableMercadoPagoCredentials(storeId);
    if (credentials.organization_id !== organizationId) throw new Error("PedeAqui billing Mercado Pago organization mismatch");
    if (credentials.environment !== "production" || credentials.connection_mode !== "oauth") {
      throw new Error("PedeAqui billing Mercado Pago source must be production OAuth");
    }
    if (source.value.provider_account_id && credentials.provider_account_id !== source.value.provider_account_id) {
      throw new Error("PedeAqui billing Mercado Pago account mismatch");
    }
    return credentials;
  }

  static async webhookSecret() {
    return (await this.credentials({ requireBillingEnabled: false })).webhook_secret;
  }
}
