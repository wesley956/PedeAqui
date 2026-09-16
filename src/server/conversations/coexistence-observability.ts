import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  summarizeWebhookReceiptKinds,
  type MetaSubscriptionStatus,
} from "@/server/conversations/coexistence-observability-model";
import type { WhatsAppParsedEvent } from "@/server/conversations/whatsapp-webhook";
import { recordFailure } from "@/server/observability/failure";

const TABLE = "whatsapp_coexistence_observability";

type RoutingRow = {
  organization_id: string;
  store_id: string;
  whatsapp_phone_number_id: string | null;
};

export type WhatsAppCoexistenceObservabilitySnapshot = {
  telemetryAvailable: boolean;
  subscriptionStatus: MetaSubscriptionStatus;
  subscriptionCheckedAt: string | null;
  lastSubscriptionErrorKind: string | null;
  lastMessagesWebhookAt: string | null;
  lastEchoWebhookAt: string | null;
  lastEchoPersistedAt: string | null;
  lastIngestErrorKind: string | null;
  lastIngestErrorAt: string | null;
};

const EMPTY_SNAPSHOT: WhatsAppCoexistenceObservabilitySnapshot = {
  telemetryAvailable: false,
  subscriptionStatus: "unknown",
  subscriptionCheckedAt: null,
  lastSubscriptionErrorKind: null,
  lastMessagesWebhookAt: null,
  lastEchoWebhookAt: null,
  lastEchoPersistedAt: null,
  lastIngestErrorKind: null,
  lastIngestErrorAt: null,
};

function failureContext(requestId: string | undefined, organizationId?: string, storeId?: string) {
  return requestId ? { requestId, organizationId, storeId } : null;
}

async function safeUpsert(
  row: Record<string, unknown> & { organization_id: string; store_id: string },
  event: string,
  requestId?: string,
) {
  try {
    const { error } = await createAdminClient().from(TABLE).upsert(row, { onConflict: "store_id" });
    if (error) throw error;
    return true;
  } catch (error) {
    const context = failureContext(requestId, row.organization_id, row.store_id);
    if (context) recordFailure(event, error, context);
    return false;
  }
}

export class WhatsAppCoexistenceObservability {
  static async recordWebhookReceipt(events: readonly WhatsAppParsedEvent[], requestId: string) {
    const relevant = events.filter((event) => event.kind === "message" || event.kind === "echo");
    if (relevant.length === 0) return;

    const phoneNumberIds = [...new Set(relevant.map((event) => event.phoneNumberId))];
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.from("store_conversation_settings")
        .select("organization_id, store_id, whatsapp_phone_number_id")
        .eq("provider", "meta_cloud")
        .eq("whatsapp_enabled", true)
        .eq("connection_mode", "coexistence")
        .in("whatsapp_phone_number_id", phoneNumberIds);
      if (error) throw error;

      const now = new Date().toISOString();
      const rows = ((data ?? []) as RoutingRow[]).flatMap((settings) => {
        if (!settings.whatsapp_phone_number_id) return [];
        const flags = summarizeWebhookReceiptKinds(
          relevant.filter((event) => event.phoneNumberId === settings.whatsapp_phone_number_id).map((event) => event.kind),
        );
        if (!flags.messages && !flags.echo) return [];
        return [{
          organization_id: settings.organization_id,
          store_id: settings.store_id,
          ...(flags.messages ? { last_messages_webhook_at: now } : {}),
          ...(flags.echo ? { last_echo_webhook_at: now } : {}),
          updated_at: now,
        }];
      });
      if (rows.length === 0) return;
      const { error: writeError } = await admin.from(TABLE).upsert(rows, { onConflict: "store_id" });
      if (writeError) throw writeError;
    } catch (error) {
      recordFailure("whatsapp.coexistence_observability.webhook_receipt_failed", error, { requestId });
    }
  }

  static async recordEchoPersisted(organizationId: string, storeId: string, requestId?: string) {
    const now = new Date().toISOString();
    await safeUpsert({
      organization_id: organizationId,
      store_id: storeId,
      last_echo_persisted_at: now,
      last_ingest_error_kind: null,
      last_ingest_error_at: null,
      updated_at: now,
    }, "whatsapp.coexistence_observability.echo_persisted_failed", requestId);
  }

  static async recordEchoIngestFailure(
    organizationId: string,
    storeId: string,
    errorKind: string,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    await safeUpsert({
      organization_id: organizationId,
      store_id: storeId,
      last_ingest_error_kind: errorKind.slice(0, 120),
      last_ingest_error_at: now,
      updated_at: now,
    }, "whatsapp.coexistence_observability.ingest_failure_marker_failed", requestId);
  }

  static async recordSubscriptionCheck(
    organizationId: string,
    storeId: string,
    status: MetaSubscriptionStatus,
    errorKind: string | null,
  ) {
    const now = new Date().toISOString();
    await safeUpsert({
      organization_id: organizationId,
      store_id: storeId,
      subscription_status: status,
      subscription_checked_at: now,
      last_subscription_error_kind: errorKind?.slice(0, 120) ?? null,
      updated_at: now,
    }, "whatsapp.coexistence_observability.subscription_marker_failed");
  }

  static async load(organizationId: string, storeId: string): Promise<WhatsAppCoexistenceObservabilitySnapshot> {
    try {
      const { data, error } = await createAdminClient().from(TABLE)
        .select("subscription_status, subscription_checked_at, last_subscription_error_kind, last_messages_webhook_at, last_echo_webhook_at, last_echo_persisted_at, last_ingest_error_kind, last_ingest_error_at")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...EMPTY_SNAPSHOT, telemetryAvailable: true };
      return {
        telemetryAvailable: true,
        subscriptionStatus: (data.subscription_status ?? "unknown") as MetaSubscriptionStatus,
        subscriptionCheckedAt: data.subscription_checked_at ?? null,
        lastSubscriptionErrorKind: data.last_subscription_error_kind ?? null,
        lastMessagesWebhookAt: data.last_messages_webhook_at ?? null,
        lastEchoWebhookAt: data.last_echo_webhook_at ?? null,
        lastEchoPersistedAt: data.last_echo_persisted_at ?? null,
        lastIngestErrorKind: data.last_ingest_error_kind ?? null,
        lastIngestErrorAt: data.last_ingest_error_at ?? null,
      };
    } catch {
      return { ...EMPTY_SNAPSHOT };
    }
  }
}
