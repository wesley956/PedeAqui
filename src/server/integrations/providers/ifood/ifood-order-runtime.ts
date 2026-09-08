import { IntegrationProviderError } from "@/server/integrations/core/errors";
import { IntegrationProviderRegistry } from "@/server/integrations/core/provider-registry";
import {
  pollIfoodOrderEvents,
  pollIfoodOrderMerchants,
  summarizeIfoodConfirmationSla,
  type IfoodConfirmationSlaRecord,
  type IfoodOrderIntakeRepositoryPort,
  type IfoodOrderPollingScope,
} from "@/server/integrations/providers/ifood/ifood-order-intake";
import type { IfoodOrdersHttpPort } from "@/server/integrations/providers/ifood/ifood-orders-http-client";
import {
  IfoodSalesChannelAdapter,
  type IfoodAccessTokenProvider,
} from "@/server/integrations/providers/ifood/ifood-sales-adapter";
import {
  processExternalOrderInboxBatch,
  type ExternalOrderImporter,
  type ExternalOrderPostImportHook,
} from "@/server/integrations/runtime/external-order-inbox-handler";
import type { IntegrationInboxEvent } from "@/server/integrations/runtime/runtime-repository";
import type { InboxRuntimeRepository } from "@/server/integrations/runtime/workers";

export interface IfoodOrderScopePort {
  enabledScopes(): Promise<IfoodOrderPollingScope[]>;
  isEnabled(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
  }): Promise<boolean>;
  pendingConfirmationSla(
    scopes: readonly Pick<IfoodOrderPollingScope, "integrationAccountId" | "storeId">[],
    riskSeconds?: number,
  ): Promise<IfoodConfirmationSlaRecord[]>;
}

export type IfoodOrderRuntimeRepository = IfoodOrderIntakeRepositoryPort & InboxRuntimeRepository;

export type IfoodOrderIntakeCycleResult = {
  enabledScopes: number;
  polling: {
    succeeded: number;
    failed: number;
    received: number;
    ingested: number;
    duplicates: number;
    rejected: number;
    acknowledgedDuplicates: number;
    acknowledgmentFailures: number;
  };
  processing: {
    claimed: number;
    processed: number;
    ignored: number;
    retried: number;
    deadLettered: number;
    ackFailed: number;
  };
  sla: ReturnType<typeof summarizeIfoodConfirmationSla>;
};

const emptyProcessing = {
  claimed: 0,
  processed: 0,
  ignored: 0,
  retried: 0,
  deadLettered: 0,
  ackFailed: 0,
};

function scopeKey(scope: Pick<IfoodOrderPollingScope, "integrationAccountId" | "storeId">) {
  return `${scope.integrationAccountId}:${scope.storeId}`;
}

/**
 * Pure end-to-end cycle used by the server-only composition root. Enabled
 * scopes are frozen at the start, while provider fetch and ACK each revalidate
 * capability state at their last safe boundary.
 */
export async function runIfoodOrderIntakeCycle(input: {
  scopeRepository: IfoodOrderScopePort;
  runtimeRepository: IfoodOrderRuntimeRepository;
  tokenProvider: IfoodAccessTokenProvider;
  http: IfoodOrdersHttpPort;
  importOrder: ExternalOrderImporter;
  reconcileLifecycle?: ExternalOrderPostImportHook;
  workerId: string;
  pollLimit?: number;
  processLimit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  slaRiskSeconds?: number;
}): Promise<IfoodOrderIntakeCycleResult> {
  const scopes = await input.scopeRepository.enabledScopes();
  const pollingSummary = {
    succeeded: 0,
    failed: 0,
    received: 0,
    ingested: 0,
    duplicates: 0,
    rejected: 0,
    acknowledgedDuplicates: 0,
    acknowledgmentFailures: 0,
  };
  if (scopes.length === 0) {
    return {
      enabledScopes: 0,
      polling: pollingSummary,
      processing: emptyProcessing,
      sla: summarizeIfoodConfirmationSla([]),
    };
  }

  const registry = new IntegrationProviderRegistry();
  const scopeByPair = new Map<string, IfoodOrderPollingScope>();
  for (const scope of scopes) {
    const key = scopeKey(scope);
    if (scopeByPair.has(key)) {
      throw new IntegrationProviderError("Duplicate iFood account/store runtime scope", "ifood_runtime_scope_duplicate", false);
    }
    scopeByPair.set(key, scope);
    registry.register("sales", scope, new IfoodSalesChannelAdapter(scope, input.http, input.tokenProvider));
  }

  const polling = await pollIfoodOrderMerchants({
    scopes,
    run: (scope) => pollIfoodOrderEvents({
      scope,
      adapter: registry.resolve("sales", scope),
      repository: input.runtimeRepository,
      http: input.http,
      tokenProvider: input.tokenProvider,
      isScopeEnabled: () => input.scopeRepository.isEnabled(scope),
      limit: input.pollLimit,
    }),
  });
  for (const result of polling) {
    if (!result.summary) {
      pollingSummary.failed += 1;
      continue;
    }
    pollingSummary.succeeded += 1;
    pollingSummary.received += result.summary.received;
    pollingSummary.ingested += result.summary.ingested;
    pollingSummary.duplicates += result.summary.duplicates;
    pollingSummary.rejected += result.summary.rejected;
    pollingSummary.acknowledgedDuplicates += result.summary.acknowledgedDuplicates;
    pollingSummary.acknowledgmentFailures += result.summary.acknowledgedDuplicates;
    if (result.summary.acknowledgmentFailed) pollingSummary.acknowledgmentFailures += 1;
  }

  const scopeEnabled = async (scope: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: string;
    capability: string;
  }) => scope.provider === "ifood"
    && scope.capability === "ifood_orders"
    && input.scopeRepository.isEnabled(scope);

  const acknowledge = async (event: IntegrationInboxEvent) => {
    const scope = scopeByPair.get(scopeKey({
      integrationAccountId: event.integration_account_id,
      storeId: event.store_id,
    }));
    if (!scope || !(await scopeEnabled({
      organizationId: event.organization_id,
      storeId: event.store_id,
      integrationAccountId: event.integration_account_id,
      provider: event.provider,
      capability: event.capability,
    }))) {
      throw new IntegrationProviderError("iFood scope was disabled before ACK", "ifood_ack_scope_disabled", true);
    }
    const accessToken = await input.tokenProvider.validAccessToken(
      scope.organizationId,
      scope.integrationAccountId,
    );
    await input.http.acknowledgeEvents({
      accessToken,
      eventIds: [event.external_event_id],
    });
  };

  const processing = await processExternalOrderInboxBatch({
    repository: input.runtimeRepository,
    registry,
    workerId: input.workerId,
    importOrder: input.importOrder,
    afterImport: input.reconcileLifecycle,
    acknowledge,
    isScopeEnabled: scopeEnabled,
    capabilities: ["ifood_orders"],
    scopes: scopes.map((scope) => ({
      integrationAccountId: scope.integrationAccountId,
      storeId: scope.storeId,
    })),
    limit: input.processLimit,
    leaseSeconds: input.leaseSeconds,
    maxAttempts: input.maxAttempts,
  });

  const slaRows = await input.scopeRepository.pendingConfirmationSla(scopes, input.slaRiskSeconds);
  return {
    enabledScopes: scopes.length,
    polling: pollingSummary,
    processing,
    sla: summarizeIfoodConfirmationSla(slaRows),
  };
}
