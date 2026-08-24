import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppEchoEvent, WhatsAppSyncEvent } from "@/server/conversations/whatsapp-webhook";

export class WhatsAppCoexistenceService {
  static async ingest(event: WhatsAppEchoEvent | WhatsAppSyncEvent) {
    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin.from("store_conversation_settings")
      .select("organization_id, store_id, whatsapp_enabled, connection_mode")
      .eq("provider", "meta_cloud")
      .eq("whatsapp_phone_number_id", event.phoneNumberId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.whatsapp_enabled) throw new Error("Evento de coexistência recebido para número não habilitado.");
    if (settings.connection_mode !== "coexistence") {
      return { ignored: true, reason: "not_coexistence" };
    }

    if (event.kind === "sync") {
      // History/contact sync pode conter alto volume e PII. O PedeAqui reconhece
      // e autentica esses webhooks, mas não importa agenda/histórico antigo
      // silenciosamente. A conversa operacional passa a sincronizar pelos echoes.
      return { ignored: true, reason: event.syncType, itemCount: event.itemCount };
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
    if (error) throw error;
    return data;
  }
}
