import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";
import { redactSensitive } from "@/server/observability/redact";

export type DomainEventInput = {
  type: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
};

export type DomainEvent = DomainEventInput & {
  id: string;
  organizationId: string;
  storeId: string | null;
  status: "pending" | "processing" | "processed" | "failed";
};

export class EventService {
  static async enqueue(context: AccessContext, event: DomainEventInput): Promise<string> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("domain_events")
      .insert({
        organization_id: context.organizationId,
        store_id: context.storeId,
        event_type: event.type,
        entity_type: event.entityType,
        entity_id: event.entityId ?? null,
        payload: redactSensitive(event.payload ?? {}),
        status: "pending",
        occurred_at: (event.occurredAt ?? new Date()).toISOString(),
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  static async markProcessed(eventId: string) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("domain_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
      .eq("id", eventId);

    if (error) throw error;
  }

  static async markFailed(eventId: string, errorMessage: string) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("domain_events")
      .update({ status: "failed", error_message: errorMessage.slice(0, 2000) })
      .eq("id", eventId);

    if (error) throw error;
  }
}
