import { describe, expect, it, vi } from "vitest";
import { validateCanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";
import { IfoodSalesChannelAdapter } from "@/server/integrations/providers/ifood/ifood-sales-adapter";
import {
  normalizeIfoodOrderDetails,
  normalizeIfoodPollingEvent,
} from "@/server/integrations/providers/ifood/ifood-orders-model";
import {
  pollIfoodOrderEvents,
  pollIfoodOrderMerchants,
  type DurableIfoodEventStatus,
  type IfoodOrderIntakeRepositoryPort,
} from "@/server/integrations/providers/ifood/ifood-order-intake";

const scope = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  storeId: "00000000-0000-4000-8000-000000000002",
  integrationAccountId: "00000000-0000-4000-8000-000000000003",
  externalMerchantId: "merchant-a",
  enabled: true,
};

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    displayId: "A001",
    status: "CONFIRMED",
    orderType: "DELIVERY",
    orderTiming: "IMMEDIATE",
    salesChannel: "IFOOD",
    category: "FOOD",
    createdAt: "2026-09-07T20:00:00.000Z",
    preparationStartDateTime: "2026-09-07T20:02:00.000Z",
    isTest: true,
    merchant: { id: "merchant-a", name: "Sandbox Restaurant" },
    customer: {
      name: "Cliente Teste",
      phone: { number: "0800 000 0000", localizer: "12345678" },
      futureField: "tolerated",
    },
    items: [{
      id: "item-1",
      uniqueId: "line-1",
      name: "Hamburguer",
      quantity: 1,
      unitPrice: 25,
      price: 25,
      optionsPrice: 2,
      totalPrice: 27,
      observations: "Sem cebola",
      options: [{ id: "opt-1", name: "Bacon", quantity: 1, unitPrice: 2, addition: 0, price: 2 }],
    }],
    benefits: [{
      value: 2,
      sponsorshipValues: [{ name: "IFOOD", value: 2, futureField: true }],
    }],
    total: { subTotal: 27, deliveryFee: 5, additionalFees: 0, benefits: 2, orderAmount: 30 },
    payments: {
      prepaid: 28,
      pending: 0,
      methods: [{ value: 28, currency: "BRL", type: "ONLINE", method: "PIX" }],
    },
    delivery: {
      deliveredBy: "IFOOD",
      mode: "DEFAULT",
      pickupCode: "4321",
      deliveryAddress: {
        streetName: "Rua A",
        streetNumber: "10",
        neighborhood: "Centro",
        city: "Americana",
        state: "SP",
        postalCode: "13400-000",
        complement: "Casa",
        reference: "Portao azul",
        coordinates: { latitude: -22.7, longitude: -47.3 },
      },
    },
    futureTopLevelField: { accepted: true },
    ...overrides,
  };
}

function pollingEvent(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    code: "CONFIRMED",
    fullCode: "ORDER_CONFIRMED",
    orderId: `order-${id}`,
    merchantId: "merchant-a",
    createdAt: "2026-09-07T20:00:00.000Z",
    metadata: { future: "value" },
    ...overrides,
  };
}

class MemoryInbox implements IfoodOrderIntakeRepositoryPort {
  readonly byExternalId = new Map<string, { id: string; status: DurableIfoodEventStatus }>();

  async ingestEvent(input: Parameters<IfoodOrderIntakeRepositoryPort["ingestEvent"]>[0]) {
    const existing = this.byExternalId.get(input.externalEventId);
    if (existing) return { id: existing.id, duplicate: true };
    const id = `durable-${input.externalEventId}`;
    this.byExternalId.set(input.externalEventId, { id, status: "pending" });
    return { id, duplicate: false };
  }

  async eventStatus(input: Parameters<IfoodOrderIntakeRepositoryPort["eventStatus"]>[0]) {
    return [...this.byExternalId.values()].find((row) => row.id === input.eventId)?.status ?? null;
  }
}

function fakeHttp(rows: unknown[] = []) {
  return {
    pollEvents: vi.fn(async () => rows),
    acknowledgeEvents: vi.fn(async () => undefined),
    getOrder: vi.fn(async () => orderFixture()),
  };
}

function fakeTokenProvider() {
  return { validAccessToken: vi.fn(async () => "token") };
}

describe("iFood order normalization", () => {
  it("accepts documented fields plus unknown extensions and preserves canonical invariants", () => {
    const normalized = normalizeIfoodOrderDetails(orderFixture(), "merchant-a");
    expect(normalized.provider).toBe("ifood");
    expect(normalized.paymentOwner).toBe("provider");
    expect(normalized.logisticsOwner).toBe("ifood");
    expect(normalized.money.totalCents).toBe(3000);
    expect(normalized.payments).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "PIX", amountCents: 2800, prepaid: true }),
      expect.objectContaining({ method: "IFOOD_BENEFIT", amountCents: 200, prepaid: true }),
    ]));
    expect(validateCanonicalExternalOrder(normalized)).toEqual({ valid: true });
  });

  it("maps scheduled orders without changing the canonical board model", () => {
    const normalized = normalizeIfoodOrderDetails(orderFixture({
      orderTiming: "SCHEDULED",
      scheduling: {
        deliveryDateTimeStart: "2026-09-08T18:00:00.000Z",
        deliveryDateTimeEnd: "2026-09-08T18:30:00.000Z",
      },
    }), "merchant-a");
    expect(normalized.timing).toBe("scheduled");
    expect(normalized.scheduledFor).toBe("2026-09-08T18:00:00.000Z");
  });

  it("rejects cross-merchant order details", () => {
    expect(() => normalizeIfoodOrderDetails(orderFixture(), "merchant-b")).toThrow(/merchant/i);
  });

  it("normalizes one polling event with a stable provider event id", () => {
    const event = normalizeIfoodPollingEvent(pollingEvent("evt-1"), "merchant-a");
    expect(event).toMatchObject({
      provider: "ifood",
      capability: "ifood_orders",
      eventId: "evt-1",
      eventType: "ORDER_CONFIRMED",
      merchantExternalId: "merchant-a",
    });
  });
});

describe("iFood durable polling intake", () => {
  it("does zero token or provider traffic while capability is OFF", async () => {
    const http = fakeHttp([pollingEvent("evt-1")]);
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({
      scope: { ...scope, enabled: false },
      adapter,
      repository,
      http,
      tokenProvider,
    });

    expect(result.disabled).toBe(true);
    expect(tokenProvider.validAccessToken).not.toHaveBeenCalled();
    expect(http.pollEvents).not.toHaveBeenCalled();
    expect(http.acknowledgeEvents).not.toHaveBeenCalled();
  });

  it("persists a full 100-event polling batch before any ACK", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => pollingEvent(`evt-${index}`));
    const http = fakeHttp(rows);
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({ scope, adapter, repository, http, tokenProvider, limit: 100 });
    expect(result).toMatchObject({ received: 100, ingested: 100, duplicates: 0, rejected: 0 });
    expect(repository.byExternalId.size).toBe(100);
    expect(http.acknowledgeEvents).not.toHaveBeenCalled();
  });

  it("isolates one malformed event without losing valid peers", async () => {
    const http = fakeHttp([pollingEvent("good-a"), { broken: true }, pollingEvent("good-b")]);
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({ scope, adapter, repository, http, tokenProvider });
    expect(result).toMatchObject({ received: 3, ingested: 2, rejected: 1 });
    expect(repository.byExternalId.has("good-a")).toBe(true);
    expect(repository.byExternalId.has("good-b")).toBe(true);
  });

  it("retries a previously failed ACK by acknowledging a durable processed duplicate", async () => {
    const http = fakeHttp([pollingEvent("evt-processed")]);
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    repository.byExternalId.set("evt-processed", { id: "durable-evt-processed", status: "processed" });
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({ scope, adapter, repository, http, tokenProvider });
    expect(result).toMatchObject({ duplicates: 1, acknowledgedDuplicates: 1, rejected: 0 });
    expect(http.acknowledgeEvents).toHaveBeenCalledWith({
      accessToken: "token",
      eventIds: ["evt-processed"],
    });
  });

  it("never ACKs a duplicate that is not durably processed", async () => {
    const http = fakeHttp([pollingEvent("evt-pending")]);
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    repository.byExternalId.set("evt-pending", { id: "durable-evt-pending", status: "pending" });
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({ scope, adapter, repository, http, tokenProvider });
    expect(result.duplicates).toBe(1);
    expect(result.acknowledgedDuplicates).toBe(0);
    expect(http.acknowledgeEvents).not.toHaveBeenCalled();
  });

  it("revalidates capability before retrying a duplicate ACK", async () => {
    const http = fakeHttp([pollingEvent("evt-processed")]);
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    repository.byExternalId.set("evt-processed", { id: "durable-evt-processed", status: "processed" });
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({
      scope,
      adapter,
      repository,
      http,
      tokenProvider,
      isScopeEnabled: async () => false,
    });

    expect(result.duplicates).toBe(1);
    expect(result.acknowledgedDuplicates).toBe(0);
    expect(http.acknowledgeEvents).not.toHaveBeenCalled();
  });

  it("keeps ACK failure recoverable through the next polling redelivery", async () => {
    const http = fakeHttp([pollingEvent("evt-processed")]);
    http.acknowledgeEvents.mockRejectedValueOnce(new Error("provider unavailable"));
    const tokenProvider = fakeTokenProvider();
    const repository = new MemoryInbox();
    repository.byExternalId.set("evt-processed", { id: "durable-evt-processed", status: "processed" });
    const adapter = new IfoodSalesChannelAdapter({ ...scope }, http, tokenProvider);

    const result = await pollIfoodOrderEvents({ scope, adapter, repository, http, tokenProvider });
    expect(result.acknowledgmentFailed).toBe(true);
    expect(repository.byExternalId.get("evt-processed")?.status).toBe("processed");
  });

  it("isolates merchant-level polling failures", async () => {
    const scopes = [scope, { ...scope, storeId: "store-b", integrationAccountId: "account-b", externalMerchantId: "merchant-b" }];
    const results = await pollIfoodOrderMerchants({
      scopes,
      run: vi.fn(async (current) => {
        if (current.externalMerchantId === "merchant-a") throw new Error("token expired");
        return {
          disabled: false,
          received: 0,
          ingested: 0,
          duplicates: 0,
          rejected: 0,
          acknowledgedDuplicates: 0,
          acknowledgmentFailed: false,
        };
      }),
    });
    expect(results[0]!.error).toBeInstanceOf(Error);
    expect(results[1]!.summary?.received).toBe(0);
  });
});
