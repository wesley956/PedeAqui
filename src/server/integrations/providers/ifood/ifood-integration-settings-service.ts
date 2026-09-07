import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { createIfoodAuthService } from "@/server/integrations/providers/ifood/ifood-auth-runtime";
import { isIfoodEnvironment, type IfoodEnvironment, type IfoodStartConnectionResult } from "@/server/integrations/providers/ifood/ifood-auth-model";

type DbError = { code?: string | null; message?: string | null } | null;

function requireStore(storeId: string | null): string {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

function missingInfrastructure(error: DbError): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("pgrst205") || text.includes("integration_accounts") && (text.includes("does not exist") || text.includes("schema cache"));
}

export type IfoodSettingsEnvironmentSnapshot = {
  environment: IfoodEnvironment;
  applicationConfigured: boolean;
  accountId: string | null;
  authMode: "centralized" | "distributed" | null;
  status: "connected" | "attention" | "action_required" | "unavailable" | "disconnected";
  connectionState: string;
  lastHealthAt: string | null;
  lastHealthErrorCode: string | null;
  merchant: {
    id: string;
    externalMerchantId: string;
    displayName: string | null;
    capabilities: Record<string, boolean>;
  } | null;
};

export type IfoodSettingsSnapshot = {
  infrastructureReady: boolean;
  environments: IfoodSettingsEnvironmentSnapshot[];
};

export class IfoodIntegrationSettingsService {
  static async snapshot(): Promise<IfoodSettingsSnapshot> {
    const context = await authorize(PERMISSIONS.INTEGRATIONS_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();

    const accounts = await admin
      .from("integration_accounts")
      .select("id,status,environment,auth_mode,connection_state,last_health_at,last_health_error_code")
      .eq("organization_id", context.organizationId)
      .eq("provider", "ifood");

    if (missingInfrastructure(accounts.error)) {
      return {
        infrastructureReady: false,
        environments: ["sandbox", "production"].map((environment) => ({
          environment: environment as IfoodEnvironment,
          applicationConfigured: false,
          accountId: null,
          authMode: null,
          status: "disconnected",
          connectionState: "not_connected",
          lastHealthAt: null,
          lastHealthErrorCode: null,
          merchant: null,
        })),
      };
    }
    if (accounts.error) throw accounts.error;

    const merchants = await admin
      .from("integration_merchants")
      .select("id,integration_account_id,environment,external_merchant_id,display_name,capabilities")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("provider", "ifood");
    if (merchants.error) throw merchants.error;

    const credentialsConfigured = new Map<IfoodEnvironment, boolean>();
    for (const environment of ["sandbox", "production"] as const) {
      const credentials = await admin.rpc("integration_ifood_app_credentials", { p_environment: environment });
      credentialsConfigured.set(environment, !credentials.error && Boolean(credentials.data));
    }

    return {
      infrastructureReady: true,
      environments: (["sandbox", "production"] as const).map((environment) => {
        const account = (accounts.data ?? []).find((row) => row.environment === environment);
        const merchant = account
          ? (merchants.data ?? []).find((row) => row.integration_account_id === account.id && row.environment === environment)
          : null;
        const rawCaps = merchant?.capabilities && typeof merchant.capabilities === "object" && !Array.isArray(merchant.capabilities)
          ? merchant.capabilities as Record<string, unknown>
          : {};
        const capabilities = Object.fromEntries(Object.entries(rawCaps).map(([key, value]) => [key, value === true]));
        return {
          environment,
          applicationConfigured: credentialsConfigured.get(environment) === true,
          accountId: account?.id ? String(account.id) : null,
          authMode: account?.auth_mode === "centralized" || account?.auth_mode === "distributed" ? account.auth_mode : null,
          status: account?.status === "connected" || account?.status === "attention" || account?.status === "action_required" || account?.status === "unavailable" ? account.status : "disconnected",
          connectionState: typeof account?.connection_state === "string" ? account.connection_state : "not_connected",
          lastHealthAt: typeof account?.last_health_at === "string" ? account.last_health_at : null,
          lastHealthErrorCode: typeof account?.last_health_error_code === "string" ? account.last_health_error_code : null,
          merchant: merchant ? {
            id: String(merchant.id),
            externalMerchantId: String(merchant.external_merchant_id),
            displayName: typeof merchant.display_name === "string" ? merchant.display_name : null,
            capabilities,
          } : null,
        } satisfies IfoodSettingsEnvironmentSnapshot;
      }),
    };
  }

  static async startConnection(environment: IfoodEnvironment): Promise<IfoodStartConnectionResult> {
    if (!isIfoodEnvironment(environment)) throw new Error("Invalid iFood environment");
    const context = await authorize(PERMISSIONS.INTEGRATIONS_MANAGE);
    const storeId = requireStore(context.storeId);
    return createIfoodAuthService().startConnection({
      organizationId: context.organizationId,
      storeId,
      environment,
      actorUserId: context.userId,
    });
  }

  static async completeDistributedAuthorization(input: {
    integrationAccountId: string;
    sessionId: string;
    state: string;
    authorizationCode: string;
  }) {
    const context = await authorize(PERMISSIONS.INTEGRATIONS_MANAGE);
    const storeId = requireStore(context.storeId);
    return createIfoodAuthService().completeDistributedAuthorization({
      organizationId: context.organizationId,
      storeId,
      integrationAccountId: input.integrationAccountId,
      sessionId: input.sessionId,
      state: input.state,
      authorizationCode: input.authorizationCode.trim(),
      actorUserId: context.userId,
    });
  }

  static async bindMerchant(input: { integrationAccountId: string; merchantId: string }) {
    const context = await authorize(PERMISSIONS.INTEGRATIONS_MANAGE);
    const storeId = requireStore(context.storeId);
    return createIfoodAuthService().bindMerchantAndCheckHealth({
      organizationId: context.organizationId,
      storeId,
      integrationAccountId: input.integrationAccountId,
      merchantId: input.merchantId,
      actorUserId: context.userId,
    });
  }

  static async disconnect(integrationAccountId: string): Promise<void> {
    const context = await authorize(PERMISSIONS.INTEGRATIONS_MANAGE);
    const storeId = requireStore(context.storeId);
    await createIfoodAuthService().disconnect({
      organizationId: context.organizationId,
      storeId,
      integrationAccountId,
      actorUserId: context.userId,
    });
  }
}
