import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { IfoodOrderPollingScope } from "@/server/integrations/providers/ifood/ifood-order-intake";

type DbError = { message?: string | null } | null;

function throwIfError(error: DbError, context: string): void {
  if (!error) return;
  throw new Error(`${context}: ${error.message ?? "database error"}`);
}

function capabilityEnabled(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).ifood_orders === true,
  );
}

function accountOperational(row: { status?: unknown; connection_state?: unknown }): boolean {
  return (row.status === "connected" || row.status === "attention")
    && row.connection_state === "connected";
}

/**
 * Server-role resolver for the exact store/account pairs allowed to produce
 * iFood Orders API traffic. Capability=false, disconnected/action-required and
 * temporarily unavailable accounts are excluded before token lookup or HTTP.
 */
export class IfoodOrderScopeRepository {
  constructor(private readonly db = createAdminClient()) {}

  async enabledScopes(): Promise<IfoodOrderPollingScope[]> {
    const merchants = await this.db
      .from("integration_merchants")
      .select("organization_id,store_id,integration_account_id,external_merchant_id,environment,capabilities")
      .eq("provider", "ifood");
    throwIfError(merchants.error, "iFood order merchant scope lookup failed");

    const enabledMerchants = (merchants.data ?? []).filter((row) => capabilityEnabled(row.capabilities));
    if (enabledMerchants.length === 0) return [];

    const accountIds = [...new Set(enabledMerchants.map((row) => String(row.integration_account_id)))];
    const accounts = await this.db
      .from("integration_accounts")
      .select("id,organization_id,environment,status,connection_state")
      .eq("provider", "ifood")
      .in("id", accountIds);
    throwIfError(accounts.error, "iFood order account scope lookup failed");

    const accountById = new Map((accounts.data ?? []).map((row) => [String(row.id), row]));
    return enabledMerchants.flatMap((merchant) => {
      const account = accountById.get(String(merchant.integration_account_id));
      if (!account || !accountOperational(account)) return [];
      if (String(account.organization_id) !== String(merchant.organization_id)) return [];
      if (String(account.environment) !== String(merchant.environment)) return [];
      return [{
        organizationId: String(merchant.organization_id),
        storeId: String(merchant.store_id),
        integrationAccountId: String(merchant.integration_account_id),
        externalMerchantId: String(merchant.external_merchant_id),
        enabled: true,
      } satisfies IfoodOrderPollingScope];
    });
  }

  async isEnabled(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
  }): Promise<boolean> {
    const merchant = await this.db
      .from("integration_merchants")
      .select("environment,capabilities")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("integration_account_id", input.integrationAccountId)
      .eq("provider", "ifood")
      .maybeSingle();
    throwIfError(merchant.error, "iFood order merchant revalidation failed");
    if (!merchant.data || !capabilityEnabled(merchant.data.capabilities)) return false;

    const account = await this.db
      .from("integration_accounts")
      .select("environment,status,connection_state")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", "ifood")
      .maybeSingle();
    throwIfError(account.error, "iFood order account revalidation failed");
    if (!account.data || !accountOperational(account.data)) return false;
    return String(account.data.environment) === String(merchant.data.environment);
  }
}
