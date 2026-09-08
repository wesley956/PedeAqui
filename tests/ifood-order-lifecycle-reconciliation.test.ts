import { describe, expect, it, vi } from "vitest";
import type { CanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";
import type { SalesChannelAdapter } from "@/server/integrations/core/contracts";
import { IntegrationProviderRegistry } from "@/server/integrations/core/provider-registry";
import { resolveIfoodLifecycleMilestone } from "@/server/integrations/providers/ifood/ifood-order-lifecycle-milestones";
import { createExternalOrderInboxHandler } from "@/server/integrations/runtime/external-order-inbox-handler";

const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  storeId: "22222222-2222-4222-8222-222222222222",
  integrationAccountId: "33333333-3333-4333-8333-333333333333",
};

const canonicalOrder = {
  provider: "ifood",
  externalMerchantId: "merchant-1",
  externalOrderId: "external-order-1",
} as CanonicalExternalOrder;

function inboxEvent() {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    organization_id: scope.organizationId,
    store_id: scope.storeId,
    integration_account_id: scope.integrationAccountId,
    provider: "ifood" as const,
    capability: "ifood_orders",
    external_event_id: "event-1",
    event_type: "CFM",
    status: "processing" as const,
    payload: { id: "event-1", orderId: "external-order-1" },
    attempts: 1,
    available_at: "2026-09-07T20:00:00.000Z",
    occurred_at: "2026-09-07T20:00:00.000Z",
    received_at: "2026-09-07T20:00:01.000Z",
    processed_at: null,
    last_error_kind: null,
    last_error: null,
    locked_at: "2026-09-07T20:00:01.000Z",
    locked_by: "worker-test",
  };
}

function adapterWithSequence(sequence: string[]): SalesChannelAdapter {
  return {
    provider: "ifood",
    normalizeEvent: vi.fn(async () => []),
    resolveOrderReference: vi.fn(async () => {
      sequence.push("resolve-reference");
      return { externalOrderId: "external-order-1", externalMerchantId: "merchant-1" };
    }),
    fetchOrder: vi.fn(async () => {
      sequence.push("fetch-order");
      return {
        provider: "ifood",
        externalOrderId: "external-order-1",
        externalMerchantId: "merchant-1",
        rawStatus: "CONFIRMED",
        revision: "rev-1",
        payload: {},
      };
    }),
    normalizeOrder: vi.fn(async () => {
      sequence.push("normalize-order");
      return canonicalOrder;
    }),
    executeOrderCommand: vi.fn(async () => ({ accepted: true, externalReference: null, retryable: false })),
  };
}

describe("iFood lifecycle milestone mapping", () => {
  it.each([
    ["CFM", null, "confirmed"],
    ["PREPARATION_STARTED", null, "preparing"],
    ["RTP", null, "ready"],
    ["CANCELLED", null, "canceled"],
    ["CON", null, "concluded"],
    ["UNKNOWN_EVENT", "READY_TO_PICKUP", "ready"],
  ])("maps event=%s status=%s to %s", (eventType, externalStatus, expected) => {
    expect(resolveIfoodLifecycleMilestone({ eventType, externalStatus })).toBe(expected);
  });

  it("ignores events that do not prove a lifecycle transition", () => {
    expect(resolveIfoodLifecycleMilestone({ eventType: "ORDER_PLACED", externalStatus: "PLACED" })).toBeNull();
  });
});

describe("external order post-import reconciliation hook", () => {
  it("runs reconciliation only after the canonical snapshot is durable", async () => {
    const sequence: string[] = [];
    const registry = new IntegrationProviderRegistry();
    registry.register("sales", scope, adapterWithSequence(sequence));

    const handler = createExternalOrderInboxHandler({
      registry,
      importOrder: async (input) => {
        sequence.push("import-canonical");
        expect(input.externalStatus).toBe("CONFIRMED");
        return {
          order_id: "55555555-5555-4555-8555-555555555555",
          display_number: 42,
          created: false,
        };
      },
      afterImport: async ({ event, externalStatus, importResult }) => {
        sequence.push("reconcile-lifecycle");
        expect(event.event_type).toBe("CFM");
        expect(externalStatus).toBe("CONFIRMED");
        expect(importResult.order_id).toBe("55555555-5555-4555-8555-555555555555");
      },
      isScopeEnabled: async () => true,
    });

    await expect(handler(inboxEvent())).resolves.toEqual({ status: "processed", acknowledge: true });
    expect(sequence).toEqual([
      "resolve-reference",
      "fetch-order",
      "normalize-order",
      "import-canonical",
      "reconcile-lifecycle",
    ]);
  });

  it("fails the durable inbox attempt when reconciliation fails, preventing provider ACK", async () => {
    const sequence: string[] = [];
    const registry = new IntegrationProviderRegistry();
    registry.register("sales", scope, adapterWithSequence(sequence));

    const handler = createExternalOrderInboxHandler({
      registry,
      importOrder: async () => {
        sequence.push("import-canonical");
        return {
          order_id: "55555555-5555-4555-8555-555555555555",
          display_number: 42,
          created: false,
        };
      },
      afterImport: async () => {
        sequence.push("reconcile-lifecycle");
        throw new Error("temporary reconciliation failure");
      },
      isScopeEnabled: async () => true,
    });

    await expect(handler(inboxEvent())).rejects.toThrow("temporary reconciliation failure");
    expect(sequence.at(-1)).toBe("reconcile-lifecycle");
  });
});
