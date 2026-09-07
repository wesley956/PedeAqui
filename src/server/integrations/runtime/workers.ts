import { decideIntegrationRetry } from "@/server/integrations/runtime/retry-policy";
import type {
  IntegrationInboxEvent,
  IntegrationOutboxCommand,
} from "@/server/integrations/runtime/runtime-repository";

export interface InboxRuntimeRepository {
  claimEvents(
    workerId: string,
    limit?: number,
    leaseSeconds?: number,
    capabilities?: readonly string[],
    integrationAccountIds?: readonly string[],
  ): Promise<IntegrationInboxEvent[]>;
  finishEvent(input: {
    eventId: string;
    workerId: string;
    status: "processed" | "ignored" | "retry" | "dead_letter";
    errorKind?: string | null;
    error?: string | null;
    availableAt?: string | null;
  }): Promise<boolean>;
}

export interface OutboxRuntimeRepository {
  claimOutbox(workerId: string, limit?: number, leaseSeconds?: number): Promise<IntegrationOutboxCommand[]>;
  finishOutbox(input: {
    outboxId: string;
    workerId: string;
    status: "sent" | "confirmed" | "retry" | "dead_letter";
    errorKind?: string | null;
    error?: string | null;
    availableAt?: string | null;
  }): Promise<boolean>;
}

export type InboxHandlerResult = {
  status: "processed" | "ignored";
  acknowledge?: boolean;
};

export async function processInboxBatch(input: {
  repository: InboxRuntimeRepository;
  workerId: string;
  handler: (event: IntegrationInboxEvent) => Promise<InboxHandlerResult>;
  acknowledge?: (event: IntegrationInboxEvent) => Promise<void>;
  capabilities?: readonly string[];
  integrationAccountIds?: readonly string[];
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
}): Promise<{ claimed: number; processed: number; ignored: number; retried: number; deadLettered: number; ackFailed: number }> {
  const events = await input.repository.claimEvents(
    input.workerId,
    input.limit,
    input.leaseSeconds,
    input.capabilities,
    input.integrationAccountIds,
  );
  const summary = { claimed: events.length, processed: 0, ignored: 0, retried: 0, deadLettered: 0, ackFailed: 0 };

  for (const event of events) {
    try {
      const result = await input.handler(event);
      const finished = await input.repository.finishEvent({
        eventId: event.id,
        workerId: input.workerId,
        status: result.status,
      });
      if (!finished) continue;

      if (result.status === "processed") summary.processed += 1;
      else summary.ignored += 1;

      if (result.acknowledge && input.acknowledge) {
        try {
          await input.acknowledge(event);
        } catch {
          // Durable state is already committed. Redelivery is safe because inbox ingestion is idempotent.
          summary.ackFailed += 1;
        }
      }
    } catch (error) {
      const retry = decideIntegrationRetry({
        error,
        attempts: event.attempts,
        maxAttempts: input.maxAttempts,
      });

      if (retry.action === "retry") {
        await input.repository.finishEvent({
          eventId: event.id,
          workerId: input.workerId,
          status: "retry",
          errorKind: retry.error.kind,
          error: retry.error.message,
          availableAt: retry.availableAt,
        });
        summary.retried += 1;
      } else {
        await input.repository.finishEvent({
          eventId: event.id,
          workerId: input.workerId,
          status: "dead_letter",
          errorKind: retry.error.kind,
          error: retry.error.message,
        });
        summary.deadLettered += 1;
      }
    }
  }

  return summary;
}

export async function processOutboxBatch(input: {
  repository: OutboxRuntimeRepository;
  workerId: string;
  execute: (command: IntegrationOutboxCommand) => Promise<{ confirmed?: boolean; retryAfterMs?: number | null }>;
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
}): Promise<{ claimed: number; sent: number; confirmed: number; retried: number; deadLettered: number }> {
  const commands = await input.repository.claimOutbox(input.workerId, input.limit, input.leaseSeconds);
  const summary = { claimed: commands.length, sent: 0, confirmed: 0, retried: 0, deadLettered: 0 };

  for (const command of commands) {
    try {
      const result = await input.execute(command);
      const status = result.confirmed ? "confirmed" : "sent";
      const finished = await input.repository.finishOutbox({
        outboxId: command.id,
        workerId: input.workerId,
        status,
      });
      if (!finished) continue;
      if (status === "confirmed") summary.confirmed += 1;
      else summary.sent += 1;
    } catch (error) {
      const retry = decideIntegrationRetry({
        error,
        attempts: command.attempts,
        maxAttempts: input.maxAttempts,
      });

      if (retry.action === "retry") {
        await input.repository.finishOutbox({
          outboxId: command.id,
          workerId: input.workerId,
          status: "retry",
          errorKind: retry.error.kind,
          error: retry.error.message,
          availableAt: retry.availableAt,
        });
        summary.retried += 1;
      } else {
        await input.repository.finishOutbox({
          outboxId: command.id,
          workerId: input.workerId,
          status: "dead_letter",
          errorKind: retry.error.kind,
          error: retry.error.message,
        });
        summary.deadLettered += 1;
      }
    }
  }

  return summary;
}