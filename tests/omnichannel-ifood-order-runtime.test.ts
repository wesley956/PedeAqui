import { describe, expect, it, vi } from "vitest";
import type {
  IfoodConfirmationSlaRecord,
  IfoodOrderPollingScope,
} from "@/server/integrations/providers/ifood/ifood-order-intake";
import { runIfoodOrderIntakeCycle } from "@/server/integrations/providers/ifood/ifood-order-runtime";
import type { ExternalOrderImportInput } from "@/server/integrations/runtime/external-order-inbox-handler";
import type { IntegrationInboxEvent } from "@/server/integrations/runtime/runtime-repository";

const scope: IfoodOrderPollingScope = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  storeId: "00000000-0000-4000-8000-000000000002",
  integrationAccountId: "00000000-0000-4000-8000-000000000003",
  externalMerchantId: "merchant-a",
  enabled: true,
};

function providerEvent(): IntegrationInboxEvent {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    organization_id: scope.organizationId,
    store_id: scope.storeId,
    integration_account_id: scope.integrationAccountId,
    provider: "ifood",
    capability: "ifood_orders",
    external_event_id: "event-a",
    event_type: "ORDER_PLACED",
    status: "processing",
    payload: {
      id: "event-a",
      code: "PLACED",
      fullCode: "ORDER_PLACED",
      orderId: "order-a",
      merchantId: "merchant-a",
      createdAt: "2026-09-07T20:00:00.000Z",
    },
    attempts: 1,
    available_at: "2026-09-07T20:00:00.000Z",
    occurred_at: "2026-09-07T20:00:00.000Z",
    received_at: "2026-09-07T20:00:10.000Z",
    processed_at: null,
    last_error_kind: null,
    last_error: null,
    locked_at: "2026-09-07T20:00:10.000Z",
    locked_by: "worker",
  };
}

function orderDetails() {
  return {
    id: "order-a",
    status: "PLACED",
    orderType: "TAKEOUT",
    orderTiming: "IMMEDIATE",
    createdAt: "2026-09-07T20:00:00.000Z",
    merchant: { id: "merchant-a" },
    customer: { name: "Cliente" },
    items: [{ name: "Pedido", quantity: 1, unitPrice: 10, price: 10, totalPrice: 10 }],
    benefits: [],
    total: { subTotal: 10, deliveryFee: 0, benefits: 0, additionalFees: 0, orderAmount: 10 },
    payments: { prepaid: 0, pending: 10, methods: [{ value: 10, type: "OFFLINE", method: "CASH" }] },
  };
}

function lifecycleHttpStubs() {
  return {
    confirmOrder: vi.fn(async () => undefined),
    startPreparation: vi.fn(async () => undefined),
    readyToPickup: vi.fn(async () => undefined),
    getCancellationReasons: vi.fn(async () => []),
    requestCancellation: vi.fn(async () => undefined),
  };
}

describe("configured iFood order intake cycle", () => {
  it("does no token, HTTP, claim or SLA work with zero enabled scopes", async () => {
    const http = {
      pollEvents: vi.fn(),
      acknowledgeEvents: vi.fn(),
      getOrder: vi.fn(),
      ...lifecycleHttpStubs(),
    };
    const runtime = {
      ingestEvent: vi.fn(),
      eventStatus: vi.fn(),
      claimEvents: vi.fn(),
      finishEvent: vi.fn(),
    };
    const tokenProvider = { validAccessToken: vi.fn() };
    const result = await runIfoodOrderIntakeCycle({
      scopeRepository: {
        enabledScopes: vi.fn(async () => []),
        isEnabled: vi.fn(),
        pendingConfirmationSla: vi.fn(),
      },
      runtimeRepository: runtime,
      tokenProvider,
      http,
      importOrder: vi.fn(),
      workerId: "worker",
    });

    expect(result.enabledScopes).toBe(0);
    expect(tokenProvider.validAccessToken).not.toHaveBeenCalled();
    expect(http.pollEvents).not.toHaveBeenCalled();
    expect(runtime.claimEvents).not.toHaveBeenCalled();
  });

  it("connects polling, exact-scope claim, canonical import, durable finish, ACK and SLA", async () => {
    const event = providerEvent();
    const sequence: string[] = [];
    const scopeEnabled = vi.fn(async () => true);
    const http = {
      pollEvents: vi.fn(async () => [event.payload]),
      getOrder: vi.fn(async () => {
        sequence.push("fetch");
        return orderDetails();
      }),
      acknowledgeEvents: vi.fn(async () => {
        sequence.push("ack");
      }),
      ...lifecycleHttpStubs(),
    };
    const runtime = {
      ingestEvent: vi.fn(async () => ({ id: event.id, duplicate: false })),
      eventStatus: vi.fn(),
      claimEvents: vi.fn(async (
        _workerId: string,
        _limit?: number,
        _leaseSeconds?: number,
        capabilities?: readonly string[],
        scopes?: readonly { integrationAccountId: string; storeId: string }[],
      ) => {
        expect(capabilities).toEqual(["ifood_orders"]);
        expect(scopes).toEqual([{ integrationAccountId: scope.integrationAccountId, storeId: scope.storeId }]);
        return [event];
      }),
      finishEvent: vi.fn(async () => {
        sequence.push("finish");
        return true;
      }),
    };
    const slaRows: IfoodConfirmationSlaRecord[] = [{
      organizationId: scope.organizationId,
      storeId: scope.storeId,
      integrationAccountId: scope.integrationAccountId,
      orderId: "00000000-0000-4000-8000-000000000005",
      externalOrderId: "order-a",
      providerCreatedAt: "2026-09-07T20:00:00.000Z",
      receivedAt: "2026-09-07T20:00:10.000Z",
      importedAt: "2026-09-07T20:00:15.000Z",
      confirmationDeadline: "2026-09-07T20:08:00.000Z",
      providerToReceivedSeconds: 10,
      receivedToImportedSeconds: 5,
      secondsRemaining: 90,
      state: "risk",
    }];
    const imported = vi.fn(async (input: ExternalOrderImportInput) => {
      sequence.push("import");
      expect(input.order).toMatchObject({ externalOrderId: "order-a", externalMerchantId: "merchant-a" });
      return { order_id: slaRows[0]!.orderId, display_number: 1, created: true };
    });

    const result = await runIfoodOrderIntakeCycle({
      scopeRepository: {
        enabledScopes: vi.fn(async () => [scope]),
        isEnabled: scopeEnabled,
        pendingConfirmationSla: vi.fn(async () => slaRows),
      },
      runtimeRepository: runtime,
      tokenProvider: { validAccessToken: vi.fn(async () => "token") },
      http,
      importOrder: imported,
      workerId: "worker",
    });

    expect(result.polling).toMatchObject({ succeeded: 1, received: 1, ingested: 1, failed: 0 });
    expect(result.processing).toMatchObject({ claimed: 1, processed: 1, ackFailed: 0 });
    expect(result.sla).toMatchObject({ tracked: 1, atRisk: 1, expired: 0, maxProviderLagSeconds: 10, maxImportLagSeconds: 5 });
    expect(sequence).toEqual(["fetch", "import", "finish", "ack"]);
    expect(scopeEnabled).toHaveBeenCalledTimes(2);
  });

  it("does not issue ACK if capability turns off after durable import", async () => {
    const event = providerEvent();
    const enabledChecks = [true, false];
    const http = {
      pollEvents: vi.fn(async () => []),
      getOrder: vi.fn(async () => orderDetails()),
      acknowledgeEvents: vi.fn(async () => undefined),
      ...lifecycleHttpStubs(),
    };
    const result = await runIfoodOrderIntakeCycle({
      scopeRepository: {
        enabledScopes: vi.fn(async () => [scope]),
        isEnabled: vi.fn(async () => enabledChecks.shift() ?? false),
        pendingConfirmationSla: vi.fn(async () => []),
      },
      runtimeRepository: {
        ingestEvent: vi.fn(),
        eventStatus: vi.fn(),
        claimEvents: vi.fn(async () => [event]),
        finishEvent: vi.fn(async () => true),
      },
      tokenProvider: { validAccessToken: vi.fn(async () => "token") },
      http,
      importOrder: vi.fn(async () => ({ order_id: "00000000-0000-4000-8000-000000000005", display_number: 1, created: true })),
      workerId: "worker",
    });

    expect(result.processing.processed).toBe(1);
    expect(result.processing.ackFailed).toBe(1);
    expect(http.acknowledgeEvents).not.toHaveBeenCalled();
  });
});
