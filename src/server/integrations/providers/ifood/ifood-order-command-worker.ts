import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IntegrationConfigurationError,
  IntegrationProviderError,
} from "@/server/integrations/core/errors";
import { IfoodAuthHttpClient } from "@/server/integrations/providers/ifood/ifood-auth-http-client";
import { IfoodAuthRepository } from "@/server/integrations/providers/ifood/ifood-auth-repository";
import { IfoodAuthService } from "@/server/integrations/providers/ifood/ifood-auth-service";
import { IfoodOrderScopeRepository } from "@/server/integrations/providers/ifood/ifood-order-scope-repository";
import { IfoodOrdersHttpClient } from "@/server/integrations/providers/ifood/ifood-orders-http-client";
import { IfoodSalesChannelAdapter } from "@/server/integrations/providers/ifood/ifood-sales-adapter";
import {
  IntegrationRuntimeRepository,
  type IntegrationOutboxCommand,
} from "@/server/integrations/runtime/runtime-repository";
import { processOutboxBatch, type OutboxRuntimeRepository } from "@/server/integrations/runtime/workers";

const payloadSchema = z.object({
  externalOrderId: z.string().min(1),
  externalMerchantId: z.string().min(1),
  reason: z.string().min(1).optional(),
});

const operationSchema = z.enum([
  "confirm",
  "start_preparation",
  "mark_ready",
  "request_cancellation",
]);

class IfoodOrderOutboxRepository implements OutboxRuntimeRepository {
  private readonly db = createAdminClient();
  private readonly runtime = new IntegrationRuntimeRepository(this.db);

  async claimOutbox(workerId: string, limit = 10, leaseSeconds = 120): Promise<IntegrationOutboxCommand[]> {
    const { data, error } = await this.db.rpc("integration_claim_outbox_scoped", {
      p_limit: limit,
      p_worker_id: workerId,
      p_provider: "ifood",
      p_capability: "ifood_orders",
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(`iFood order outbox claim failed: ${error.message}`);
    return (data ?? []) as IntegrationOutboxCommand[];
  }

  async finishOutbox(input: {
    outboxId: string;
    workerId: string;
    status: "sent" | "confirmed" | "retry" | "dead_letter";
    errorKind?: string | null;
    error?: string | null;
    availableAt?: string | null;
  }): Promise<boolean> {
    const current = await this.db
      .from("integration_outbox")
      .select("organization_id,store_id,order_id")
      .eq("id", input.outboxId)
      .maybeSingle();
    if (current.error) throw current.error;

    const finished = await this.runtime.finishOutbox(input);
    if (!finished || !current.data?.order_id) return finished;

    const syncStatus = input.status === "dead_letter"
      ? "attention"
      : input.status === "retry"
        ? "retry"
        : input.status === "confirmed"
          ? "synced"
          : "pending";
    const sync = await this.db
      .from("external_orders")
      .update({ sync_status: syncStatus, updated_at: new Date().toISOString() })
      .eq("organization_id", current.data.organization_id)
      .eq("store_id", current.data.store_id)
      .eq("order_id", current.data.order_id)
      .eq("provider", "ifood");
    if (sync.error) throw sync.error;
    return true;
  }
}

function scopeKey(input: { integrationAccountId: string; storeId: string }): string {
  return `${input.integrationAccountId}:${input.storeId}`;
}

/**
 * Executes only iFood order lifecycle outbox rows. A successful HTTP 202 leaves
 * the command as `sent`; a later iFood polling event confirms the canonical
 * state transition and reconciliation marks the command confirmed.
 */
export async function runConfiguredIfoodOrderCommands(input?: {
  workerId?: string;
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
}) {
  const scopeRepository = new IfoodOrderScopeRepository();
  const scopes = await scopeRepository.enabledScopes();
  const scopeByKey = new Map(scopes.map((scope) => [scopeKey(scope), scope]));
  const auth = new IfoodAuthService(
    new IfoodAuthRepository(),
    new IfoodAuthHttpClient(),
  );
  const http = new IfoodOrdersHttpClient();
  const adapterByKey = new Map<string, IfoodSalesChannelAdapter>();

  const result = await processOutboxBatch({
    repository: new IfoodOrderOutboxRepository(),
    workerId: input?.workerId ?? `ifood-order-command:${randomUUID()}`,
    limit: input?.limit ?? 100,
    leaseSeconds: input?.leaseSeconds,
    maxAttempts: input?.maxAttempts,
    execute: async (command) => {
      if (command.provider !== "ifood" || command.capability !== "ifood_orders") {
        throw new IntegrationConfigurationError(
          "iFood lifecycle worker received an out-of-scope command",
          "ifood_order_outbox_scope_mismatch",
        );
      }
      const operation = operationSchema.parse(command.operation);
      const payload = payloadSchema.parse(command.payload);
      const key = scopeKey({
        integrationAccountId: command.integration_account_id,
        storeId: command.store_id,
      });
      const scope = scopeByKey.get(key);
      if (!scope || scope.organizationId !== command.organization_id) {
        throw new IntegrationProviderError(
          "The iFood order connection is not operational for this command",
          "ifood_order_scope_unavailable",
          true,
        );
      }
      if (scope.externalMerchantId !== payload.externalMerchantId) {
        throw new IntegrationConfigurationError(
          "iFood outbox merchant does not match the enabled store binding",
          "ifood_order_outbox_merchant_mismatch",
        );
      }

      let adapter = adapterByKey.get(key);
      if (!adapter) {
        adapter = new IfoodSalesChannelAdapter(scope, http, auth);
        adapterByKey.set(key, adapter);
      }
      const response = await adapter.executeOrderCommand({
        externalOrderId: payload.externalOrderId,
        merchantExternalId: payload.externalMerchantId,
        command: operation,
        idempotencyKey: command.idempotency_key,
        payload: payload.reason ? { reason: payload.reason } : undefined,
      });
      if (!response.accepted) {
        throw new IntegrationProviderError(
          "iFood did not accept the order command",
          "ifood_order_command_not_accepted",
          response.retryable,
        );
      }
      return { confirmed: false };
    },
  });

  return { enabledScopes: scopes.length, ...result };
}
