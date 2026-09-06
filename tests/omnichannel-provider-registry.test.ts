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
import { IntegrationConfigurationError, IntegrationProviderError, classifyIntegrationError } from "@/server/integrations/core/errors";
import { IntegrationProviderRegistry, type IntegrationAdapterScope } from "@/server/integrations/core/provider-registry";

function canonicalOrder(snapshot: ExternalOrderSnapshot): CanonicalExternalOrder {
  return {
    provider: "ifood",
    externalMerchantId: snapshot.externalMerchantId,
    externalOrderId: snapshot.externalOrderId,
    externalDisplayId: "IF-1",
    orderType: "takeout",
    timing: "immediate",
    createdAt: "2026-09-06T00:00:00.000Z",
    scheduledFor: null,
    recommendedPreparationAt: null,
    customer: { name: "Cliente Mock", phone: null },
    deliveryAddress: null,
    items: [{
      externalId: "item-1",
      name: "Item Mock",
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
    pickupCode: null,
    deliveryCode: null,
    providerMetadata: { source: "mock" },
  };
}

class MockSalesAdapter implements SalesChannelAdapter {
  readonly provider = "ifood" as const;
  readonly commands: SalesChannelOrderCommand[] = [];

  async normalizeEvent(input: unknown): Promise<IntegrationEventEnvelope[]> {
    return [{
      provider: this.provider,
      capability: "ifood_orders",
      eventId: "evt-1",
      eventType: "UNKNOWN_PROVIDER_ENUM",
      occurredAt: null,
      receivedAt: "2026-09-06T00:00:00.000Z",
      merchantExternalId: "merchant-1",
      payload: input,
    }];
  }

  async resolveOrderReference(event: IntegrationEventEnvelope): Promise<ExternalOrderReference | null> {
    if (event.eventType === "HEARTBEAT") return null;
    return {
      externalOrderId: "order-1",
      externalMerchantId: event.merchantExternalId ?? "merchant-1",
    };
  }

  async fetchOrder(externalOrderId: string, merchantExternalId: string): Promise<ExternalOrderSnapshot> {
    return {
      provider: this.provider,
      externalOrderId,
      externalMerchantId: merchantExternalId,
      rawStatus: "UNRECOGNIZED_STATUS",
      revision: null,
      payload: { source: "mock" },
    };
  }

  async normalizeOrder(snapshot: ExternalOrderSnapshot): Promise<CanonicalExternalOrder> {
    return canonicalOrder(snapshot);
  }

  async executeOrderCommand(input: {
    externalOrderId: string;
    merchantExternalId: string;
    command: SalesChannelOrderCommand;
    idempotencyKey: string;
    payload?: unknown;
  }): Promise<AdapterCommandResult> {
    this.commands.push(input.command);
    return { accepted: true, externalReference: input.idempotencyKey, retryable: false };
  }
}

const storeA: IntegrationAdapterScope = {
  organizationId: "org-1",
  storeId: "store-a",
  integrationAccountId: "account-a",
};
const storeB: IntegrationAdapterScope = {
  organizationId: "org-1",
  storeId: "store-b",
  integrationAccountId: "account-b",
};

describe("omnichannel provider registry", () => {
  it("runs a complete mock sales flow without network access", async () => {
    const registry = new IntegrationProviderRegistry();
    const mock = new MockSalesAdapter();
    registry.register("sales", storeA, mock);

    const adapter = registry.resolve("sales", storeA);
    const events = await adapter.normalizeEvent({ anything: true });
    const envelope = events[0];
    expect(envelope).toBeDefined();
    const reference = await adapter.resolveOrderReference(envelope!);
    expect(reference).not.toBeNull();
    const order = await adapter.fetchOrder(reference!.externalOrderId, reference!.externalMerchantId);
    const normalized = await adapter.normalizeOrder(order);
    const result = await adapter.executeOrderCommand({
      externalOrderId: order.externalOrderId,
      merchantExternalId: order.externalMerchantId,
      command: "confirm",
      idempotencyKey: "cmd-1",
    });

    expect(events[0]?.eventType).toBe("UNKNOWN_PROVIDER_ENUM");
    expect(order.rawStatus).toBe("UNRECOGNIZED_STATUS");
    expect(normalized.externalOrderId).toBe("order-1");
    expect(result.accepted).toBe(true);
    expect(mock.commands).toEqual(["confirm"]);
  });

  it("isolates adapters by organization/store/integration account", () => {
    const registry = new IntegrationProviderRegistry();
    registry.register("sales", storeA, new MockSalesAdapter());

    expect(registry.has("sales", storeA)).toBe(true);
    expect(registry.has("sales", storeB)).toBe(false);
    expect(() => registry.resolve("sales", storeB)).toThrowError(IntegrationConfigurationError);
  });

  it("rejects duplicate registration in the same scope", () => {
    const registry = new IntegrationProviderRegistry();
    registry.register("sales", storeA, new MockSalesAdapter());
    expect(() => registry.register("sales", storeA, new MockSalesAdapter())).toThrowError(IntegrationConfigurationError);
  });

  it("classifies provider, configuration and unexpected PedeAqui errors", () => {
    const providerError = new IntegrationProviderError("rate limited", "rate_limit", true);
    expect(classifyIntegrationError(providerError)).toMatchObject({ kind: "provider", retryable: true });

    const configError = new IntegrationConfigurationError("missing merchant");
    expect(classifyIntegrationError(configError)).toMatchObject({ kind: "configuration", retryable: false });

    expect(classifyIntegrationError(new Error("boom"))).toMatchObject({ kind: "pedeaqui", retryable: false });
  });
});
