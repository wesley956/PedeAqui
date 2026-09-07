import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "@/server/integrations/core/capabilities";

export type IntegrationInboxEvent = {
  id: string;
  organization_id: string;
  store_id: string;
  integration_account_id: string;
  provider: IntegrationProvider;
  capability: string;
  external_event_id: string;
  event_type: string;
  status: "pending" | "processing" | "processed" | "ignored" | "retry" | "dead_letter";
  payload: unknown;
  attempts: number;
  available_at: string;
  occurred_at: string | null;
  received_at: string;
  processed_at: string | null;
  last_error_kind: string | null;
  last_error: string | null;
  locked_at: string | null;
  locked_by: string | null;
};

export type IntegrationOutboxCommand = {
  id: string;
  organization_id: string;
  store_id: string;
  order_id: string | null;
  integration_account_id: string;
  provider: IntegrationProvider;
  capability: string;
  operation: string;
  idempotency_key: string;
  status: "pending" | "processing" | "sent" | "confirmed" | "retry" | "dead_letter";
  payload: unknown;
  attempts: number;
  available_at: string;
  created_at: string;
  sent_at: string | null;
  confirmed_at: string | null;
  last_error_kind: string | null;
  last_error: string | null;
  locked_at: string | null;
  locked_by: string | null;
};

type DbError = { message: string; code?: string | null } | null;

function throwIfDbError(error: DbError, context: string): void {
  if (!error) return;
  throw new Error(`${context}: ${error.message}`);
}

export class IntegrationRuntimeRepository {
  constructor(private readonly db = createAdminClient()) {}

  async ingestEvent(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: IntegrationProvider;
    capability: string;
    externalEventId: string;
    eventType: string;
    payload: unknown;
    occurredAt?: string | null;
    receivedAt?: string;
  }): Promise<{ id: string; duplicate: boolean }> {
    const { data, error } = await this.db
      .from("integration_events")
      .upsert({
        organization_id: input.organizationId,
        store_id: input.storeId,
        integration_account_id: input.integrationAccountId,
        provider: input.provider,
        capability: input.capability,
        external_event_id: input.externalEventId,
        event_type: input.eventType,
        payload: input.payload,
        occurred_at: input.occurredAt ?? null,
        received_at: input.receivedAt ?? new Date().toISOString(),
      }, {
        onConflict: "integration_account_id,store_id,external_event_id",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle();

    throwIfDbError(error, "integration event ingestion failed");
    if (data?.id) return { id: String(data.id), duplicate: false };

    const existing = await this.db
      .from("integration_events")
      .select("id")
      .eq("integration_account_id", input.integrationAccountId)
      .eq("store_id", input.storeId)
      .eq("external_event_id", input.externalEventId)
      .single();
    throwIfDbError(existing.error, "integration event dedupe lookup failed");
    if (!existing.data?.id) throw new Error("integration event dedupe lookup returned no row");
    return { id: String(existing.data.id), duplicate: true };
  }

  async claimEvents(
    workerId: string,
    limit = 10,
    leaseSeconds = 120,
    capabilities?: readonly string[],
  ): Promise<IntegrationInboxEvent[]> {
    const { data, error } = await this.db.rpc("integration_claim_events", {
      p_limit: limit,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
      p_capabilities: capabilities ? [...capabilities] : null,
    });
    throwIfDbError(error, "integration event claim failed");
    return (data ?? []) as IntegrationInboxEvent[];
  }

  async finishEvent(input: {
    eventId: string;
    workerId: string;
    status: "processed" | "ignored" | "retry" | "dead_letter";
    errorKind?: string | null;
    error?: string | null;
    availableAt?: string | null;
  }): Promise<boolean> {
    const { data, error } = await this.db.rpc("integration_finish_event", {
      p_event_id: input.eventId,
      p_worker_id: input.workerId,
      p_status: input.status,
      p_error_kind: input.errorKind ?? null,
      p_error: input.error ?? null,
      p_available_at: input.availableAt ?? null,
    });
    throwIfDbError(error, "integration event finish failed");
    return data === true;
  }

  async enqueueOutbox(input: {
    organizationId: string;
    storeId: string;
    orderId?: string | null;
    integrationAccountId: string;
    provider: IntegrationProvider;
    capability: string;
    operation: string;
    idempotencyKey: string;
    payload?: unknown;
  }): Promise<{ id: string; duplicate: boolean }> {
    const { data, error } = await this.db
      .from("integration_outbox")
      .upsert({
        organization_id: input.organizationId,
        store_id: input.storeId,
        order_id: input.orderId ?? null,
        integration_account_id: input.integrationAccountId,
        provider: input.provider,
        capability: input.capability,
        operation: input.operation,
        idempotency_key: input.idempotencyKey,
        payload: input.payload ?? {},
      }, {
        onConflict: "integration_account_id,idempotency_key",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle();

    throwIfDbError(error, "integration outbox enqueue failed");
    if (data?.id) return { id: String(data.id), duplicate: false };

    const existing = await this.db
      .from("integration_outbox")
      .select("id")
      .eq("integration_account_id", input.integrationAccountId)
      .eq("idempotency_key", input.idempotencyKey)
      .single();
    throwIfDbError(existing.error, "integration outbox dedupe lookup failed");
    if (!existing.data?.id) throw new Error("integration outbox dedupe lookup returned no row");
    return { id: String(existing.data.id), duplicate: true };
  }

  async claimOutbox(workerId: string, limit = 10, leaseSeconds = 120): Promise<IntegrationOutboxCommand[]> {
    const { data, error } = await this.db.rpc("integration_claim_outbox", {
      p_limit: limit,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    throwIfDbError(error, "integration outbox claim failed");
    return (data ?? []) as IntegrationOutboxCommand[];
  }

  async finishOutbox(input: {
    outboxId: string;
    workerId: string;
    status: "sent" | "confirmed" | "retry" | "dead_letter";
    errorKind?: string | null;
    error?: string | null;
    availableAt?: string | null;
  }): Promise<boolean> {
    const { data, error } = await this.db.rpc("integration_finish_outbox", {
      p_outbox_id: input.outboxId,
      p_worker_id: input.workerId,
      p_status: input.status,
      p_error_kind: input.errorKind ?? null,
      p_error: input.error ?? null,
      p_available_at: input.availableAt ?? null,
    });
    throwIfDbError(error, "integration outbox finish failed");
    return data === true;
  }

  async reprocessEvent(input: {
    eventId: string;
    actorUserId?: string | null;
    correlationId?: string | null;
  }): Promise<boolean> {
    const { data, error } = await this.db.rpc("integration_reprocess_event", {
      p_event_id: input.eventId,
      p_actor_user_id: input.actorUserId ?? null,
      p_correlation_id: input.correlationId ?? null,
    });
    throwIfDbError(error, "integration event reprocess failed");
    return data === true;
  }
}