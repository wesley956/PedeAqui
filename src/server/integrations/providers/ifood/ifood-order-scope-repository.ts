import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type {
  IfoodConfirmationSlaRecord,
  IfoodOrderPollingScope,
} from "@/server/integrations/providers/ifood/ifood-order-intake";

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

const slaRecordSchema = z.object({
  organization_id: z.string().uuid(),
  store_id: z.string().uuid(),
  integration_account_id: z.string().uuid(),
  order_id: z.string().uuid(),
  external_order_id: z.string().min(1),
  provider_created_at: z.string().datetime({ offset: true }),
  received_at: z.string().datetime({ offset: true }),
  imported_at: z.string().datetime({ offset: true }),
  confirmation_deadline: z.string().datetime({ offset: true }),
  provider_to_received_seconds: z.coerce.number().int().nonnegative(),
  received_to_imported_seconds: z.coerce.number().int().nonnegative(),
  seconds_remaining: z.coerce.number().int(),
  state: z.enum(["healthy", "risk", "expired"]),
});

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

  async pendingConfirmationSla(
    scopes: readonly Pick<IfoodOrderPollingScope, "integrationAccountId" | "storeId">[],
    riskSeconds = 120,
  ): Promise<IfoodConfirmationSlaRecord[]> {
    if (scopes.length === 0) return [];
    const { data, error } = await this.db.rpc("integration_ifood_confirmation_sla", {
      p_integration_account_ids: scopes.map((scope) => scope.integrationAccountId),
      p_store_ids: scopes.map((scope) => scope.storeId),
      p_risk_seconds: riskSeconds,
    });
    throwIfError(error, "iFood confirmation SLA lookup failed");
    return slaRecordSchema.array().parse(data ?? []).map((row) => ({
      organizationId: row.organization_id,
      storeId: row.store_id,
      integrationAccountId: row.integration_account_id,
      orderId: row.order_id,
      externalOrderId: row.external_order_id,
      providerCreatedAt: row.provider_created_at,
      receivedAt: row.received_at,
      importedAt: row.imported_at,
      confirmationDeadline: row.confirmation_deadline,
      providerToReceivedSeconds: row.provider_to_received_seconds,
      receivedToImportedSeconds: row.received_to_imported_seconds,
      secondsRemaining: row.seconds_remaining,
      state: row.state,
    }));
  }
}
