import type { IntegrationEventEnvelope, SalesChannelAdapter } from "@/server/integrations/core/contracts";
import { IntegrationProviderError } from "@/server/integrations/core/errors";
import type { IfoodAccessTokenProvider } from "@/server/integrations/providers/ifood/ifood-sales-adapter";
import type { IfoodOrdersHttpPort } from "@/server/integrations/providers/ifood/ifood-orders-http-client";

export type IfoodOrderPollingScope = {
  organizationId: string;
  storeId: string;
  integrationAccountId: string;
  externalMerchantId: string;
  enabled: boolean;
};

export type DurableIfoodEventStatus =
  | "pending"
  | "processing"
  | "processed"
  | "ignored"
  | "retry"
  | "dead_letter";

export interface IfoodOrderIntakeRepositoryPort {
  ingestEvent(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: "ifood";
    capability: "ifood_orders";
    externalEventId: string;
    eventType: string;
    payload: unknown;
    occurredAt?: string | null;
    receivedAt?: string;
  }): Promise<{ id: string; duplicate: boolean }>;
  eventStatus(input: {
    eventId: string;
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
  }): Promise<DurableIfoodEventStatus | null>;
}

export type IfoodPollingSummary = {
  disabled: boolean;
  received: number;
  ingested: number;
  duplicates: number;
  rejected: number;
  acknowledgedDuplicates: number;
  acknowledgmentFailed: boolean;
};

function assertIfoodEnvelope(
  envelope: IntegrationEventEnvelope,
  scope: IfoodOrderPollingScope,
): asserts envelope is IntegrationEventEnvelope {
  if (envelope.provider !== "ifood" || envelope.capability !== "ifood_orders") {
    throw new IntegrationProviderError("iFood adapter produced an invalid event envelope", "ifood_envelope_invalid", false);
  }
  if (envelope.merchantExternalId && envelope.merchantExternalId !== scope.externalMerchantId) {
    throw new IntegrationProviderError("iFood event merchant does not match polling scope", "ifood_polling_merchant_mismatch", false);
  }
}

/**
 * Executes one merchant polling request. The feature flag guard runs before
 * token lookup and before any HTTP call, making OFF mean zero provider traffic.
 * Each event is isolated so one malformed payload never drops the rest of a batch.
 *
 * If a provider ACK failed after durable processing, iFood redelivers the event.
 * A duplicate whose durable status is already processed/ignored is ACKed here
 * without re-running canonical import or internal side effects.
 */
export async function pollIfoodOrderEvents(input: {
  scope: IfoodOrderPollingScope;
  adapter: Pick<SalesChannelAdapter, "normalizeEvent">;
  repository: IfoodOrderIntakeRepositoryPort;
  http: IfoodOrdersHttpPort;
  tokenProvider: IfoodAccessTokenProvider;
  limit?: number;
}): Promise<IfoodPollingSummary> {
  const summary: IfoodPollingSummary = {
    disabled: !input.scope.enabled,
    received: 0,
    ingested: 0,
    duplicates: 0,
    rejected: 0,
    acknowledgedDuplicates: 0,
    acknowledgmentFailed: false,
  };
  if (!input.scope.enabled) return summary;

  const accessToken = await input.tokenProvider.validAccessToken(
    input.scope.organizationId,
    input.scope.integrationAccountId,
  );
  const rows = await input.http.pollEvents({
    accessToken,
    merchantId: input.scope.externalMerchantId,
    limit: input.limit,
  });
  summary.received = rows.length;

  const duplicateAckIds: string[] = [];
  for (const row of rows) {
    try {
      const envelopes = await input.adapter.normalizeEvent(row);
      if (envelopes.length !== 1) {
        throw new IntegrationProviderError("One iFood polling row must normalize to one event", "ifood_event_cardinality_invalid", false);
      }
      const envelope = envelopes[0];
      assertIfoodEnvelope(envelope, input.scope);
      const durable = await input.repository.ingestEvent({
        organizationId: input.scope.organizationId,
        storeId: input.scope.storeId,
        integrationAccountId: input.scope.integrationAccountId,
        provider: "ifood",
        capability: "ifood_orders",
        externalEventId: envelope.eventId,
        eventType: envelope.eventType,
        payload: envelope.payload,
        occurredAt: envelope.occurredAt,
        receivedAt: envelope.receivedAt,
      });
      if (!durable.duplicate) {
        summary.ingested += 1;
        continue;
      }

      summary.duplicates += 1;
      const status = await input.repository.eventStatus({
        eventId: durable.id,
        organizationId: input.scope.organizationId,
        storeId: input.scope.storeId,
        integrationAccountId: input.scope.integrationAccountId,
      });
      if (status === "processed" || status === "ignored") duplicateAckIds.push(envelope.eventId);
    } catch {
      summary.rejected += 1;
    }
  }

  if (duplicateAckIds.length > 0) {
    try {
      await input.http.acknowledgeEvents({ accessToken, eventIds: duplicateAckIds });
      summary.acknowledgedDuplicates = duplicateAckIds.length;
    } catch {
      // Keep events durable and let the next polling redelivery retry this ACK.
      summary.acknowledgmentFailed = true;
    }
  }
  return summary;
}

/** Merchant failures are isolated: one expired token/429/5xx never skips peers. */
export async function pollIfoodOrderMerchants(input: {
  scopes: readonly IfoodOrderPollingScope[];
  run: (scope: IfoodOrderPollingScope) => Promise<IfoodPollingSummary>;
}): Promise<Array<{ scope: IfoodOrderPollingScope; summary?: IfoodPollingSummary; error?: unknown }>> {
  const results = [];
  for (const scope of input.scopes) {
    try {
      results.push({ scope, summary: await input.run(scope) });
    } catch (error) {
      results.push({ scope, error });
    }
  }
  return results;
}
