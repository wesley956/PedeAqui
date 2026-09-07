import type { CanonicalExternalOrder, ExternalSalesProvider } from "@/server/integrations/core/canonical-external-order";
import type { IntegrationEventEnvelope } from "@/server/integrations/core/contracts";
import {
  IntegrationConfigurationError,
  IntegrationProviderError,
} from "@/server/integrations/core/errors";
import type { IntegrationProviderRegistry } from "@/server/integrations/core/provider-registry";
import type {
  IntegrationEventClaimScope,
  IntegrationInboxEvent,
} from "@/server/integrations/runtime/runtime-repository";
import {
  processInboxBatch,
  type InboxHandlerResult,
  type InboxRuntimeRepository,
} from "@/server/integrations/runtime/workers";

const SALES_ORDER_CAPABILITY_BY_PROVIDER = {
  ifood: "ifood_orders",
  "99food": "99food_orders",
} as const satisfies Record<ExternalSalesProvider, string>;

export const EXTERNAL_ORDER_INBOX_CAPABILITIES = ["ifood_orders", "99food_orders"] as const;

export type ExternalOrderImportInput = {
  organizationId: string;
  storeId: string;
  integrationAccountId: string;
  externalEventId?: string | null;
  externalStatus?: string | null;
  externalRevision?: string | null;
  correlationId?: string | null;
  order: CanonicalExternalOrder;
};

export type ExternalOrderImportResult = {
  order_id: string;
  display_number: number;
  created: boolean;
};

export type ExternalOrderImporter = (
  input: ExternalOrderImportInput,
) => Promise<ExternalOrderImportResult>;

function isExternalSalesProvider(provider: IntegrationInboxEvent["provider"]): provider is ExternalSalesProvider {
  return provider === "ifood" || provider === "99food";
}

function durableEventEnvelope(event: IntegrationInboxEvent): IntegrationEventEnvelope {
  return {
    provider: event.provider,
    capability: event.capability,
    eventId: event.external_event_id,
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    receivedAt: event.received_at,
    merchantExternalId: null,
    payload: event.payload,
  };
}

/**
 * Pure orchestration boundary for one durably-ingested marketplace order event.
 * Provider-specific payload parsing stays inside the adapter and database access
 * stays behind the injected importer. This module is intentionally testable
 * without importing server-only infrastructure.
 *
 * Returning `acknowledge: true` is safe because `processInboxBatch` performs the
 * provider ACK only after `finishEvent` succeeds for the current lease owner.
 */
export function createExternalOrderInboxHandler(input: {
  registry: IntegrationProviderRegistry;
  importOrder: ExternalOrderImporter;
}) {
  return async (event: IntegrationInboxEvent): Promise<InboxHandlerResult> => {
    if (!isExternalSalesProvider(event.provider)) {
      throw new IntegrationConfigurationError(
        `Sales-order inbox handler cannot process provider ${event.provider}`,
        "unexpected_sales_provider",
      );
    }

    const expectedCapability = SALES_ORDER_CAPABILITY_BY_PROVIDER[event.provider];
    if (event.capability !== expectedCapability) {
      throw new IntegrationConfigurationError(
        `Sales-order inbox handler received ${event.capability}; expected ${expectedCapability}`,
        "unexpected_inbox_capability",
      );
    }

    const scope = {
      organizationId: event.organization_id,
      storeId: event.store_id,
      integrationAccountId: event.integration_account_id,
    };
    const adapter = input.registry.resolve("sales", scope);

    if (adapter.provider !== event.provider) {
      throw new IntegrationConfigurationError(
        "Resolved sales adapter provider does not match the durable event provider",
        "adapter_provider_mismatch",
      );
    }

    const reference = await adapter.resolveOrderReference(durableEventEnvelope(event));
    if (!reference) {
      return { status: "ignored", acknowledge: true };
    }

    const externalOrderId = reference.externalOrderId.trim();
    const externalMerchantId = reference.externalMerchantId.trim();
    if (!externalOrderId || !externalMerchantId) {
      throw new IntegrationProviderError(
        "Provider returned an incomplete external order reference",
        "invalid_external_order_reference",
        false,
      );
    }

    const snapshot = await adapter.fetchOrder(externalOrderId, externalMerchantId);
    if (
      snapshot.provider !== event.provider
      || snapshot.externalOrderId !== externalOrderId
      || snapshot.externalMerchantId !== externalMerchantId
    ) {
      throw new IntegrationProviderError(
        "Fetched external order identity does not match the durable event reference",
        "external_order_identity_mismatch",
        false,
      );
    }

    const order = await adapter.normalizeOrder(snapshot);
    if (
      order.provider !== event.provider
      || order.externalOrderId !== snapshot.externalOrderId
      || order.externalMerchantId !== snapshot.externalMerchantId
    ) {
      throw new IntegrationProviderError(
        "Normalized external order identity does not match the fetched snapshot",
        "normalized_order_identity_mismatch",
        false,
      );
    }

    await input.importOrder({
      organizationId: event.organization_id,
      storeId: event.store_id,
      integrationAccountId: event.integration_account_id,
      externalEventId: event.external_event_id,
      externalStatus: snapshot.rawStatus,
      externalRevision: snapshot.revision,
      correlationId: event.id,
      order,
    });

    return { status: "processed", acknowledge: true };
  };
}

export type ProcessExternalOrderInboxBatchInput = {
  repository: InboxRuntimeRepository;
  registry: IntegrationProviderRegistry;
  workerId: string;
  importOrder: ExternalOrderImporter;
  acknowledge?: (event: IntegrationInboxEvent) => Promise<void>;
  capabilities?: readonly string[];
  scopes?: readonly IntegrationEventClaimScope[];
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
};

/**
 * Sales-order worker orchestration. Filters are passed all the way to the
 * database claim RPC. Provider-specific workers can therefore require both an
 * orders capability and exact account/store scopes that are currently enabled.
 */
export async function processExternalOrderInboxBatch(input: ProcessExternalOrderInboxBatchInput) {
  return processInboxBatch({
    repository: input.repository,
    workerId: input.workerId,
    handler: createExternalOrderInboxHandler({
      registry: input.registry,
      importOrder: input.importOrder,
    }),
    acknowledge: input.acknowledge,
    capabilities: input.capabilities ?? EXTERNAL_ORDER_INBOX_CAPABILITIES,
    scopes: input.scopes,
    limit: input.limit,
    leaseSeconds: input.leaseSeconds,
    maxAttempts: input.maxAttempts,
  });
}