import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppSyncEvent } from "@/server/conversations/whatsapp-webhook";
import { recordFailure } from "@/server/observability/failure";

const TABLE = "whatsapp_coexistence_observability";

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

async function safeUpsert(
  organizationId: string,
  storeId: string,
  row: Record<string, unknown>,
  eventName: string,
  requestId?: string,
) {
  try {
    const { error } = await createAdminClient().from(TABLE).upsert({
      organization_id: organizationId,
      store_id: storeId,
      ...row,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });
    if (error) throw error;
  } catch (error) {
    recordFailure(eventName, error, {
      requestId: requestId ?? `coexistence-sync:${eventName}`,
      organizationId,
      storeId,
    });
  }
}

export class WhatsAppCoexistenceSyncObservability {
  static async recordReceipt(
    organizationId: string,
    storeId: string,
    event: WhatsAppSyncEvent,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    if (event.syncType === "history") {
      await safeUpsert(organizationId, storeId, {
        last_history_webhook_at: now,
        last_history_phase: event.phase,
        last_history_chunk_order: event.chunkOrder,
        last_history_progress: event.progress,
        last_history_error_kind: event.errorCode ? `provider_${event.errorCode}`.slice(0, 120) : null,
      }, "whatsapp.coexistence_sync.history_receipt_failed", requestId);
      return;
    }
    await safeUpsert(organizationId, storeId, {
      last_state_sync_webhook_at: now,
      last_state_sync_error_kind: null,
    }, "whatsapp.coexistence_sync.state_receipt_failed", requestId);
  }

  static async recordHistoryResult(
    organizationId: string,
    storeId: string,
    result: unknown,
    requestId?: string,
  ) {
    const row = result && typeof result === "object" ? result as Record<string, unknown> : {};
    await safeUpsert(organizationId, storeId, {
      last_history_processed_at: new Date().toISOString(),
      last_history_imported_count: count(row.imported),
      last_history_duplicate_count: count(row.duplicates),
      last_history_error_kind: null,
    }, "whatsapp.coexistence_sync.history_result_failed", requestId);
  }

  static async recordStateSyncResult(
    organizationId: string,
    storeId: string,
    result: unknown,
    requestId?: string,
  ) {
    const row = result && typeof result === "object" ? result as Record<string, unknown> : {};
    await safeUpsert(organizationId, storeId, {
      last_state_sync_processed_at: new Date().toISOString(),
      last_state_sync_applied_count: count(row.applied),
      last_state_sync_ignored_count: count(row.ignored),
      last_state_sync_error_kind: null,
    }, "whatsapp.coexistence_sync.state_result_failed", requestId);
  }

  static async recordFailure(
    organizationId: string,
    storeId: string,
    syncType: WhatsAppSyncEvent["syncType"],
    errorKind: string,
    requestId?: string,
  ) {
    await safeUpsert(
      organizationId,
      storeId,
      syncType === "history"
        ? { last_history_error_kind: errorKind.slice(0, 120) }
        : { last_state_sync_error_kind: errorKind.slice(0, 120) },
      "whatsapp.coexistence_sync.failure_marker_failed",
      requestId,
    );
  }
}
