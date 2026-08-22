import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicMenuUrl, renderGreetingTemplate } from "@/server/conversations/greeting";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import { recordFailure } from "@/server/observability/failure";

type IngestResult = {
  conversation_id?: string;
  message_id?: string;
  message_created?: boolean;
};

type ClaimedOutbound = {
  claimed?: boolean;
  message_id?: string;
  delivery_status?: string;
  reason?: string;
};

export class ConversationGreetingService {
  static async afterInbound(result: unknown, requestId: string) {
    const ingest = result && typeof result === "object" ? result as IngestResult : null;
    if (!ingest?.conversation_id || !ingest.message_id) return;

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, organization_id, store_id, contact_id, channel, status")
      .eq("id", ingest.conversation_id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation || conversation.channel !== "whatsapp") return;
    if (conversation.status !== "bot") return;

    const [{ data: settings, error: settingsError }, { data: contact, error: contactError }, { data: store, error: storeError }, { data: menuSettings, error: menuError }] = await Promise.all([
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled, whatsapp_phone_number_id, access_token_secret_ref, default_bot_enabled, greeting_enabled, greeting_template, greeting_fallback_message")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .maybeSingle(),
      admin.from("contacts")
        .select("external_id")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("id", conversation.contact_id)
        .maybeSingle(),
      admin.from("stores")
        .select("name, slug, status")
        .eq("organization_id", conversation.organization_id)
        .eq("id", conversation.store_id)
        .maybeSingle(),
      admin.from("store_menu_settings")
        .select("active, accepting_orders")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (contactError) throw contactError;
    if (storeError) throw storeError;
    if (menuError) throw menuError;

    if (!settings?.default_bot_enabled) {
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Bot desabilitado nesta unidade",
        p_actor_user_id: null,
        p_source: "bot",
      });
      return;
    }
    if (!settings.greeting_enabled) return;
    if (!settings.whatsapp_enabled || !settings.whatsapp_phone_number_id || !settings.access_token_secret_ref || !contact?.external_id) return;

    const canUseMenu = Boolean(store?.slug && store.status === "active" && (menuSettings?.active ?? true) && (menuSettings?.accepting_orders ?? true));
    let body: string;
    let shouldHandoff = false;
    try {
      if (!canUseMenu || !store?.name || !store.slug) {
        body = settings.greeting_fallback_message;
        shouldHandoff = true;
      } else {
        const appUrl = process.env.APP_URL;
        if (!appUrl) throw new Error("APP_URL não configurada para o cardápio público.");
        body = renderGreetingTemplate(settings.greeting_template, store.name, buildPublicMenuUrl(appUrl, store.slug));
      }
    } catch (error) {
      recordFailure("whatsapp.greeting.render_failed", error, { requestId, organizationId: conversation.organization_id, storeId: conversation.store_id });
      body = settings.greeting_fallback_message;
      shouldHandoff = true;
    }

    const clientMessageId = `auto:greeting:${conversation.id}`;
    const { data: claim, error: claimError } = await admin.rpc("conversation_claim_bot_outbound_internal", {
      p_conversation_id: conversation.id,
      p_body: body,
      p_client_message_id: clientMessageId,
    });
    if (claimError) throw claimError;
    const claimed = claim as ClaimedOutbound | null;
    if (claimed?.claimed && claimed.message_id) {
      try {
        const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(settings.access_token_secret_ref));
        const sent = await provider.sendText({ phoneNumberId: settings.whatsapp_phone_number_id, recipient: contact.external_id, body });
        const { error: resultError } = await admin.rpc("conversation_mark_outbound_result_internal", {
          p_message_id: claimed.message_id,
          p_external_message_id: sent.externalMessageId,
          p_status: "sent",
          p_error_code: null,
          p_error_message: null,
        });
        if (resultError) throw resultError;
      } catch (error) {
        recordFailure("whatsapp.greeting.send_failed", error, { requestId, organizationId: conversation.organization_id, storeId: conversation.store_id });
        await admin.rpc("conversation_mark_outbound_result_internal", {
          p_message_id: claimed.message_id,
          p_external_message_id: null,
          p_status: "failed",
          p_error_code: "provider_error",
          p_error_message: safeWhatsAppFailureMessage(error),
        });
      }
    }

    if (shouldHandoff) {
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Cardápio indisponível para saudação automática",
        p_actor_user_id: null,
        p_source: "bot",
      });
    }
  }
}
