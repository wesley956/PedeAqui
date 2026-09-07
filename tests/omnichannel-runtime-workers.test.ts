import { describe, expect, it } from "vitest";
import { IntegrationProviderError } from "@/server/integrations/core/errors";
import { processInboxBatch, processOutboxBatch } from "@/server/integrations/runtime/workers";
import type {
  IntegrationInboxEvent,
  IntegrationOutboxCommand,
} from "@/server/integrations/runtime/runtime-repository";

const event: IntegrationInboxEvent = {
  id: "event-1",
  organization_id: "org-1",
  store_id: "store-1",
  integration_account_id: "account-1",
  provider: "ifood",
  capability: "ifood_orders",
  external_event_id: "ext-event-1",
  event_type: "ORDER_PLACED",
  status: "processing",
  payload: {},
  attempts: 1,
  available_at: "2026-09-06T05:00:00.000Z",
  occurred_at: null,
  received_at: "2026-09-06T05:00:00.000Z",
  processed_at: null,
  last_error_kind: null,
  last_error: null,
  locked_at: "2026-09-06T05:00:00.000Z",
  locked_by: "worker-1",
};

const command: IntegrationOutboxCommand = {
  id: "outbox-1",
  organization_id: "org-1",
  store_id: "store-1",
  order_id: "order-1",
  integration_account_id: "account-1",
  provider: "ifood",
  capability: "ifood_orders",
  operation: "confirm",
  idempotency_key: "ifood:order-1:confirm:v1",
  status: "processing",
  payload: {},
  attempts: 1,
  available_at: "2026-09-06T05:00:00.000Z",
  created_at: "2026-09-06T05:00:00.000Z",
  sent_at: null,
  confirmed_at: null,
  last_error_kind: null,
  last_error: null,
  locked_at: "2026-09-06T05:00:00.000Z",
  locked_by: "worker-1",
};

describe("omnichannel runtime workers", () => {
  it("acknowledges provider only after durable event finish succeeds", async () => {
    const sequence: string[] = [];
    const repository = {
      claimEvents: async () => [event],
      finishEvent: async () => {
        sequence.push("finish");
        return true;
      },
    };

    const summary = await processInboxBatch({
      repository,
      workerId: "worker-1",
      handler: async () => {
        sequence.push("handler");
        return { status: "processed", acknowledge: true };
      },
      acknowledge: async () => {
        sequence.push("ack");
      },
    });

    expect(sequence).toEqual(["handler", "finish", "ack"]);
    expect(summary.processed).toBe(1);
  });

  it("does not acknowledge when the worker lost its lease before finish", async () => {
    let acknowledged = false;
    const repository = {
      claimEvents: async () => [event],
      finishEvent: async () => false,
    };

    await processInboxBatch({
      repository,
      workerId: "worker-1",
      handler: async () => ({ status: "processed", acknowledge: true }),
      acknowledge: async () => {
        acknowledged = true;
      },
    });

    expect(acknowledged).toBe(false);
  });

  it("moves retryable inbox failures to retry instead of duplicating effects", async () => {
    const finishes: Array<Record<string, unknown>> = [];
    const repository = {
      claimEvents: async () => [event],
      finishEvent: async (input: Record<string, unknown>) => {
        finishes.push(input);
        return true;
      },
    };

    const summary = await processInboxBatch({
      repository,
      workerId: "worker-1",
      handler: async () => {
        throw new IntegrationProviderError("temporary outage", "provider_5xx", true);
      },
    });

    expect(summary.retried).toBe(1);
    expect(finishes[0]?.status).toBe("retry");
  });

  it("reuses the persisted outbox idempotency key on retryable provider commands", async () => {
    const seenKeys: string[] = [];
    const finishes: Array<Record<string, unknown>> = [];
    const repository = {
      claimOutbox: async () => [command],
      finishOutbox: async (input: Record<string, unknown>) => {
        finishes.push(input);
        return true;
      },
    };

    const summary = await processOutboxBatch({
      repository,
      workerId: "worker-1",
      execute: async (claimed) => {
        seenKeys.push(claimed.idempotency_key);
        throw new IntegrationProviderError("timeout after send", "timeout", true);
      },
    });

    expect(seenKeys).toEqual(["ifood:order-1:confirm:v1"]);
    expect(summary.retried).toBe(1);
    expect(finishes[0]?.status).toBe("retry");
  });
});
