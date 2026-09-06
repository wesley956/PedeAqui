import { describe, expect, it } from "vitest";
import type { CanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";
import type {
  AdapterCommandResult,
  ExternalOrderReference,
  ExternalOrderSnapshot,
  IntegrationEventEnvelope,
  SalesChannelAdapter,
  SalesChannelOrderCommand,
} from "@/server/integrations/core/contracts";
import { IntegrationConfigurationError, IntegrationProviderError } from "@/server/integrations/core/errors";
import { IntegrationProviderRegistry } from "@/server/integrations/core/provider-registry";
import { createExternalOrderInboxHandler } from "@/server/integrations/runtime/external-order-inbox-handler";
import type { IntegrationInboxEvent } from "@/server/integrations/runtime/runtime-repository";
import { processInboxBatch } from "@/server/integrations/runtime/workers";

const event: IntegrationInboxEvent = {
  id: "event-row-1",
  organization_id: "org-1",
  store_id: "store-1",
  integration_account_id: "account-1",
  provider: "ifood",
  capability: "ifood_orders",
  external_event_id: "provider-event-1",
  event_type: "ORDER_PLACED",
  status: "processing",
  payload: { externalOrderId: "order-1", externalMerchantId: "merchant-1" },
  attempts: 1,
  available_at: "2026-09-06T20:00:00.000Z",
  occurred_at: "2026-09-06T19:59:00.000Z",
  received_at: "2026-09-06T20:00:00.000Z",
  processed_at: null,
  last_error_kind: null,
  last_error: null,
  locked_at: "2026-09-06T20:00:00.000Z",
  locked_by: "worker-1",
};

function makeCanonicalOrder(snapshot: ExternalOrderSnapshot): CanonicalExternalOrder {
  return {
    provider: "ifood",
    externalMerchantId: snapshot.externalMerchantId,
    externalOrderId: snapshot.externalOrderId,
    externalDisplayId: "IF-0001",
    orderType: "takeout",
    timing: "immediate",
    createdAt: "2026-09-06T19:59:00.000Z",
    scheduledFor: null,
    recommendedPreparationAt: null,
    customer: { name: "Cliente Marketplace", phone: "5511999999999" },
    deliveryAddress: null,
    items: [{
      externalId: "item-1",
      name: "Pedido externo",
      quantity: 1,
      unitBasePriceCents: 1000,
      totalCents: 1000,
      notes: null,
      modifiers: [],
    }],
    money: {
      subtotalCents: 1000,
      deliveryFeeCents: 0,
      discountCents: 0,
      additionalFeeCents: 0,
      totalCents: 1000,
    },
    payments: [{ method: "provider_wallet", prepaid: true, amountCents: 1000, providerStatus: "PAID" }],
    paymentOwner: "provider",
    logisticsOwner: "merchant",
    pickupCode: "4321",
    deliveryCode: null,
    providerMetadata: { fixture: "inbox-handler" },
  };
}

class MockSalesAdapter implements SalesChannelAdapter {
  readonly provider = "ifood" as const;
  fetchFailure: Error | null = null;
  snapshotOrderId: string | null = null;
  fetches: Array<{ externalOrderId: string; externalMerchantId: string }> = [];
  normalizedSnapshots: ExternalOrderSnapshot[] = [];

  async normalizeEvent(input: unknown): Promise<IntegrationEventEnvelope[]> {
    return [{
      provider: this.provider,
      capability: "ifood_orders",
      eventId: "provider-event-1",
      eventType: "ORDER_PLACED",
      occurredAt: null,
      receivedAt: "2026-09-06T20:00:00.000Z",
      merchantExternalId: "merchant-1",
      payload: input,
    }];
  }

  async resolveOrderReference(envelope: IntegrationEventEnvelope): Promise<ExternalOrderReference | null> {
    if (envelope.eventType === "HEARTBEAT") return null;
    const payload = envelope.payload as { externalOrderId?: string; externalMerchantId?: string };
    return {
      externalOrderId: payload.externalOrderId ?? "",
      externalMerchantId: payload.externalMerchantId ?? "",
    };
  }

  async fetchOrder(externalOrderId: string, externalMerchantId: string): Promise<ExternalOrderSnapshot> {
    this.fetches.push({ externalOrderId, externalMerchantId });
    if (this.fetchFailure) throw this.fetchFailure;
    return {
      provider: this.provider,
      externalOrderId: this.snapshotOrderId ?? externalOrderId,
      externalMerchantId,
      rawStatus: "PLACED",
      revision: "rev-1",
      payload: { fetched: true },
    };
  }

  async normalizeOrder(snapshot: ExternalOrderSnapshot): Promise<CanonicalExternalOrder> {
    this.normalizedSnapshots.push(snapshot);
    return makeCanonicalOrder(snapshot);
  }

  async executeOrderCommand(_input: {
    externalOrderId: string;
    merchantExternalId: string;
    command: SalesChannelOrderCommand;
    idempotencyKey: string;
    payload?: unknown;
  }): Promise<AdapterCommandResult> {
    return { accepted: true, externalReference: null, retryable: false };
  }
}

function registryWith(adapter: SalesChannelAdapter, currentEvent = event) {
  const registry = new IntegrationProviderRegistry();
  registry.register("sales", {
    organizationId: currentEvent.organization_id,
    storeId: currentEvent.store_id,
    integrationAccountId: currentEvent.integration_account_id,
  }, adapter);
  return registry;
}

describe("omnichannel external order inbox handler", () => {
  it("resolves provider reference, fetches, normalizes and imports before requesting ACK", async () => {
    const adapter = new MockSalesAdapter();
    const imported: Array<Record<string, unknown>> = [];
    const handler = createExternalOrderInboxHandler({
      registry: registryWith(adapter),
      importOrder: async (input) => {
        imported.push(input as unknown as Record<string, unknown>);
        return { order_id: "11111111-1111-4111-8111-111111111111", display_number: 10, created: true };
      },
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "processed", acknowledge: true });
    expect(adapter.fetches).toEqual([{ externalOrderId: "order-1", externalMerchantId: "merchant-1" }]);
    expect(adapter.normalizedSnapshots).toHaveLength(1);
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      organizationId: "org-1",
      storeId: "store-1",
      integrationAccountId: "account-1",
      externalEventId: "provider-event-1",
      externalStatus: "PLACED",
      externalRevision: "rev-1",
      correlationId: "event-row-1",
    });
  });

  it("finishes and acknowledges an adapter-classified no-op without creating an order", async () => {
    const adapter = new MockSalesAdapter();
    let imported = false;
    const handler = createExternalOrderInboxHandler({
      registry: registryWith(adapter),
      importOrder: async () => {
        imported = true;
        return { order_id: "11111111-1111-4111-8111-111111111111", display_number: 10, created: true };
      },
    });

    const result = await handler({ ...event, event_type: "HEARTBEAT" });

    expect(result).toEqual({ status: "ignored", acknowledge: true });
    expect(imported).toBe(false);
    expect(adapter.fetches).toHaveLength(0);
  });

  it("refuses a non-order capability instead of silently consuming another integration event", async () => {
    const adapter = new MockSalesAdapter();
    const handler = createExternalOrderInboxHandler({ registry: registryWith(adapter) });

    await expect(handler({ ...event, capability: "ifood_catalog" }))
      .rejects.toBeInstanceOf(IntegrationConfigurationError);
  });

  it("rejects a fetched snapshot whose identity differs from the durable event reference", async () => {
    const adapter = new MockSalesAdapter();
    adapter.snapshotOrderId = "different-order";
    let imported = false;
    const handler = createExternalOrderInboxHandler({
      registry: registryWith(adapter),
      importOrder: async () => {
        imported = true;
        return { order_id: "11111111-1111-4111-8111-111111111111", display_number: 10, created: true };
      },
    });

    await expect(handler(event)).rejects.toMatchObject({ code: "external_order_identity_mismatch" });
    expect(imported).toBe(false);
  });

  it("keeps transient provider failure in retry and never acknowledges it", async () => {
    const adapter = new MockSalesAdapter();
    adapter.fetchFailure = new IntegrationProviderError("temporary provider outage", "provider_5xx", true);
    const handler = createExternalOrderInboxHandler({ registry: registryWith(adapter) });
    const finishes: Array<Record<string, unknown>> = [];
    let acknowledged = false;

    const summary = await processInboxBatch({
      repository: {
        claimEvents: async () => [event],
        finishEvent: async (input) => {
          finishes.push(input as unknown as Record<string, unknown>);
          return true;
        },
      },
      workerId: "worker-1",
      handler,
      acknowledge: async () => {
        acknowledged = true;
      },
      maxAttempts: 5,
    });

    expect(summary.retried).toBe(1);
    expect(finishes[0]?.status).toBe("retry");
    expect(acknowledged).toBe(false);
  });

  it("cannot resolve an adapter from another tenant/store/account scope", async () => {
    const adapter = new MockSalesAdapter();
    const otherEvent = { ...event, store_id: "store-other" };
    const handler = createExternalOrderInboxHandler({ registry: registryWith(adapter, event) });

    await expect(handler(otherEvent)).rejects.toBeInstanceOf(IntegrationConfigurationError);
  });
});
