import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { WhatsAppCoexistenceObservability } from "@/server/conversations/coexistence-observability";
import { WhatsAppCoexistenceSyncObservability } from "@/server/conversations/coexistence-sync-observability";
import type { WhatsAppEchoEvent, WhatsAppSyncEvent } from "@/server/conversations/whatsapp-webhook";

type CoexistenceSettings = {
  organization_id: string;
  store_id: string;
  whatsapp_enabled: boolean;
  connection_mode: string;
  coexistence_history_sync_enabled: boolean;
  coexistence_contact_sync_enabled: boolean;
};

async function ingestSync(
  admin: ReturnType<typeof createAdminClient>,
  settings: CoexistenceSettings,
  event: WhatsAppSyncEvent,
  requestId?: string,
) {
  await WhatsAppCoexistenceSyncObservability.recordReceipt(
    settings.organization_id,
    settings.store_id,
    event,
    requestId,
  );

  if (event.errorCode) {
    await WhatsAppCoexistenceSyncObservability.recordFailure(
      settings.organization_id,
      settings.store_id,
      event.syncType,
      `provider_${event.errorCode}`,
      requestId,
    );
    return { ignored: true, reason: "provider_sync_error", itemCount: event.itemCount };
  }

  if (event.syncType === "history") {
    if (!settings.coexistence_history_sync_enabled) {
      return { ignored: true, reason: "history_sync_disabled", itemCount: event.itemCount };
    }
    const items = event.historyMessages.map((message) => ({
      external_contact_id: message.externalContactId,
      phone_normalized: message.phoneNormalized,
      external_message_id: message.externalMessageId,
      direction: message.direction,
      body: message.body,
      content_type: message.contentType,
      delivery_status: message.deliveryStatus,
      provider_timestamp: message.providerTimestamp,
      metadata: message.metadata,
    }));
    const { data, error } = await admin.rpc("conversation_import_history_internal", {
      p_store_id: settings.store_id,
      p_items: items,
      p_sync_metadata: {
        phase: event.phase,
        chunk_order: event.chunkOrder,
        progress: event.progress,
      },
    });
    if (error) {
      await WhatsAppCoexistenceSyncObservability.recordFailure(
        settings.organization_id,
        settings.store_id,
        event.syncType,
        "history_import_failed",
        requestId,
      );
      throw error;
    }
    await WhatsAppCoexistenceSyncObservability.recordHistoryResult(
      settings.organization_id,
      settings.store_id,
      data,
      requestId,
    );
    return data;
  }

  if (!settings.coexistence_contact_sync_enabled) {
    return { ignored: true, reason: "contact_sync_disabled", itemCount: event.itemCount };
  }
  const items = event.contacts.map((contact) => ({
    action: contact.action,
    phone_normalized: contact.phoneNormalized,
    full_name: contact.fullName,
    synced_at: contact.syncedAt,
  }));
  const { data, error } = await admin.rpc("conversation_sync_app_contacts_internal", {
    p_store_id: settings.store_id,
    p_items: items,
  });
  if (error) {
    await WhatsAppCoexistenceSyncObservability.recordFailure(
      settings.organization_id,
      settings.store_id,
      event.syncType,
      "state_sync_import_failed",
      requestId,
    );
    throw error;
  }
  await WhatsAppCoexistenceSyncObservability.recordStateSyncResult(
    settings.organization_id,
    settings.store_id,
    data,
    requestId,
  );
  return data;
}

export class WhatsAppCoexistenceService {
  static async ingest(event: WhatsAppEchoEvent | WhatsAppSyncEvent, requestId?: string) {
    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin.from("store_conversation_settings")
      .select("organization_id, store_id, whatsapp_enabled, connection_mode, coexistence_history_sync_enabled, coexistence_contact_sync_enabled")
      .eq("provider", "meta_cloud")
      .eq("whatsapp_phone_number_id", event.phoneNumberId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.whatsapp_enabled) throw new Error("Evento de coexistência recebido para número não habilitado.");
    if (settings.connection_mode !== "coexistence") {
      return { ignored: true, reason: "not_coexistence" };
    }

    if (event.kind === "sync") {
      return ingestSync(admin, settings as CoexistenceSettings, event, requestId);
    }

    const { data, error } = await admin.rpc("conversation_receive_echo_internal", {
      p_store_id: settings.store_id,
      p_provider: "meta_cloud",
      p_external_contact_id: event.externalContactId,
      p_phone_normalized: event.phoneNormalized,
      p_external_message_id: event.externalMessageId,
      p_body: event.body,
      p_content_type: event.contentType,
      p_provider_timestamp: event.providerTimestamp,
      p_metadata: event.metadata,
    });
    if (error) {
      await WhatsAppCoexistenceObservability.recordEchoIngestFailure(
        settings.organization_id,
        settings.store_id,
        "echo_persist_failed",
        requestId,
      );
      throw error;
    }

    if (data && typeof data === "object" && "message_id" in data && data.message_id) {
      await WhatsAppCoexistenceObservability.recordEchoPersisted(settings.organization_id, settings.store_id, requestId);
    } else {
      await WhatsAppCoexistenceObservability.recordEchoIngestFailure(
        settings.organization_id,
        settings.store_id,
        "echo_persist_result_missing",
        requestId,
      );
    }
    return data;
  }
}
