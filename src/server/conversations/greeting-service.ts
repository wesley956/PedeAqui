import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  appendWhatsAppBotMenu,
  buildOrderLookupMessage,
  buildWhatsAppBotMenu,
  phonesBelongToSameCustomer,
  resolveWhatsAppBotIntent,
  TRACKING_CODE_PROMPT,
  TRACKING_NOT_FOUND_MESSAGE,
  trackingCodeFromInput,
  type WhatsAppBotStep,
} from "@/server/conversations/bot-menu";
import { buildPublicMenuUrl, renderGreetingTemplate } from "@/server/conversations/greeting";
import { buildOrderTrackingUrl } from "@/server/conversations/order-notification-model";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import { recordFailure } from "@/server/observability/failure";

type IngestResult = {
  conversation_id?: string;
  message_id?: string;
  message_created?: boolean;
  conversation_created?: boolean;
};

type ClaimedOutbound = {
  claimed?: boolean;
  message_id?: string;
  delivery_status?: string;
  reason?: string;
};

type BotContext = {
  requestId: string;
  conversation: { id: string; organization_id: string; store_id: string; contact_id: string };
  settings: { whatsapp_phone_number_id: string; access_token_secret_ref: string };
  recipient: string;
};

async function sendBotText(context: BotContext, body: string, clientMessageId: string) {
  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin.rpc("conversation_claim_bot_outbound_internal", {
    p_conversation_id: context.conversation.id,
    p_body: body,
    p_client_message_id: clientMessageId,
  });
  if (claimError) throw claimError;
  const claimed = claim as ClaimedOutbound | null;
  if (!claimed?.claimed || !claimed.message_id) return "duplicate" as const;

  try {
    const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(context.settings.access_token_secret_ref));
    const sent = await provider.sendText({
      phoneNumberId: context.settings.whatsapp_phone_number_id,
      recipient: context.recipient,
      body,
    });
    const { error } = await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimed.message_id,
      p_external_message_id: sent.externalMessageId,
      p_status: "sent",
      p_error_code: null,
      p_error_message: null,
    });
    if (error) throw error;
    return "sent" as const;
  } catch (error) {
    recordFailure("whatsapp.bot.send_failed", error, {
      requestId: context.requestId,
      organizationId: context.conversation.organization_id,
      storeId: context.conversation.store_id,
    });
    await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimed.message_id,
      p_external_message_id: null,
      p_status: "failed",
      p_error_code: "provider_error",
      p_error_message: safeWhatsAppFailureMessage(error),
    });
    await admin.rpc("conversation_transition_internal", {
      p_conversation_id: context.conversation.id,
      p_target_state: "waiting_agent",
      p_assigned_user_id: null,
      p_reason: "Falha no envio automático pelo provedor do WhatsApp",
      p_actor_user_id: null,
      p_source: "bot",
    });
    return "failed" as const;
  }
}

async function updateBotSession(conversationId: string, step: WhatsAppBotStep, messageId: string) {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await admin.rpc("automation_session_upsert_internal", {
    p_conversation_id: conversationId,
    p_step: step,
    p_context: { channel: "whatsapp_menu", version: 1 },
    p_last_input_message_id: messageId,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
}

export class ConversationGreetingService {
  static async afterInbound(result: unknown, requestId: string) {
    const ingest = result && typeof result === "object" ? result as IngestResult : null;
    if (!ingest?.conversation_id || !ingest.message_id) return;
    if (ingest.message_created === false) return;

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, organization_id, store_id, contact_id, channel, status")
      .eq("id", ingest.conversation_id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation || conversation.channel !== "whatsapp") return;
    if (conversation.status !== "bot") return;

    const [{ data: settings, error: settingsError }, { data: contact, error: contactError }, { data: store, error: storeError }, { data: menuSettings, error: menuError }, { data: inbound, error: inboundError }, { data: session, error: sessionError }] = await Promise.all([
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled, whatsapp_phone_number_id, access_token_secret_ref, default_bot_enabled, greeting_enabled, greeting_template, greeting_fallback_message")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .maybeSingle(),
      admin.from("contacts")
        .select("external_id, phone_normalized")
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
        .select("active")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .maybeSingle(),
      admin.from("messages")
        .select("body, content_type")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .eq("id", ingest.message_id)
        .maybeSingle(),
      admin.from("automation_sessions")
        .select("step, state, expires_at")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (contactError) throw contactError;
    if (storeError) throw storeError;
    if (menuError) throw menuError;
    if (inboundError) throw inboundError;
    if (sessionError) throw sessionError;

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
    if (!settings.whatsapp_enabled || !settings.whatsapp_phone_number_id || !settings.access_token_secret_ref || !contact?.external_id) {
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "WhatsApp sem conexão pronta para resposta automática",
        p_actor_user_id: null,
        p_source: "bot",
      });
      return;
    }

    const canUseMenu = Boolean(store?.slug && store.status === "active" && (menuSettings?.active ?? true));
    const botContext: BotContext = {
      requestId,
      conversation,
      settings: {
        whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
        access_token_secret_ref: settings.access_token_secret_ref,
      },
      recipient: contact.external_id,
    };

    if (!canUseMenu || !store?.name || !store.slug) {
      await sendBotText(botContext, settings.greeting_fallback_message, `auto:fallback:${ingest.message_id}`);
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Cardápio indisponível para saudação automática",
        p_actor_user_id: null,
        p_source: "bot",
      });
      return;
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      recordFailure("whatsapp.bot.app_url_missing", new Error("APP_URL não configurada"), { requestId, organizationId: conversation.organization_id, storeId: conversation.store_id });
      await sendBotText(botContext, settings.greeting_fallback_message, `auto:fallback:${ingest.message_id}`);
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Endereço público indisponível para automação do WhatsApp",
        p_actor_user_id: null,
        p_source: "bot",
      });
      return;
    }

    const menuUrl = buildPublicMenuUrl(appUrl, store.slug);
    let greetingBody: string;
    try {
      greetingBody = appendWhatsAppBotMenu(renderGreetingTemplate(settings.greeting_template, store.name, menuUrl));
    } catch (error) {
      recordFailure("whatsapp.greeting.render_failed", error, { requestId, organizationId: conversation.organization_id, storeId: conversation.store_id });
      await sendBotText(botContext, settings.greeting_fallback_message, `auto:fallback:${ingest.message_id}`);
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Mensagem inicial inválida para automação do WhatsApp",
        p_actor_user_id: null,
        p_source: "bot",
      });
      return;
    }

    const greetingResult = await sendBotText(botContext, greetingBody, `auto:greeting:${conversation.id}`);
    if (greetingResult !== "duplicate") {
      if (greetingResult === "sent") await updateBotSession(conversation.id, "menu", ingest.message_id);
      return;
    }

    const activeStep: WhatsAppBotStep = session?.state === "active"
      && (!session.expires_at || Date.parse(session.expires_at) > Date.now())
      && session.step === "awaiting_tracking_code"
      ? "awaiting_tracking_code"
      : "menu";
    const intent = resolveWhatsAppBotIntent(inbound?.content_type === "text" || inbound?.content_type === "interactive" ? inbound.body : "", activeStep);
    const responseKey = `auto:menu:${ingest.message_id}`;

    if (intent === "handoff") {
      await sendBotText(botContext, "Certo! Encaminhei sua conversa para a equipe do restaurante. Assim que alguém estiver disponível, continuará o atendimento por aqui.", responseKey);
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Cliente solicitou atendimento humano pelo menu do WhatsApp",
        p_actor_user_id: null,
        p_source: "bot",
      });
      return;
    }

    if (intent === "menu_link") {
      await sendBotText(botContext, `Aqui está o cardápio de ${store.name}: ${menuUrl}\n\nPara voltar às opções, digite menu.`, responseKey);
      await updateBotSession(conversation.id, "menu", ingest.message_id);
      return;
    }

    if (intent === "track_start") {
      await sendBotText(botContext, TRACKING_CODE_PROMPT, responseKey);
      await updateBotSession(conversation.id, "awaiting_tracking_code", ingest.message_id);
      return;
    }

    if (intent === "track_code") {
      const displayNumber = trackingCodeFromInput(inbound?.body);
      const { data: order, error: orderError } = displayNumber === null
        ? { data: null, error: null }
        : await admin.from("orders")
          .select("id, display_number, customer_phone_snapshot, order_status, production_status, fulfillment_status")
          .eq("organization_id", conversation.organization_id)
          .eq("store_id", conversation.store_id)
          .eq("display_number", displayNumber)
          .maybeSingle();
      if (orderError) throw orderError;

      if (!order || !phonesBelongToSameCustomer(contact.phone_normalized ?? contact.external_id, order.customer_phone_snapshot)) {
        await sendBotText(botContext, TRACKING_NOT_FOUND_MESSAGE, responseKey);
        await updateBotSession(conversation.id, "awaiting_tracking_code", ingest.message_id);
        return;
      }

      const { data: trackingContext, error: trackingError } = await admin.from("order_notification_contexts")
        .select("tracking_access_token")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("order_id", order.id)
        .maybeSingle();
      if (trackingError) throw trackingError;
      const trackingUrl = trackingContext?.tracking_access_token
        ? buildOrderTrackingUrl(appUrl, store.slug, order.id, trackingContext.tracking_access_token)
        : null;
      await sendBotText(botContext, buildOrderLookupMessage({
        displayNumber: Number(order.display_number),
        orderStatus: order.order_status,
        productionStatus: order.production_status,
        fulfillmentStatus: order.fulfillment_status,
        trackingUrl,
      }), responseKey);
      await updateBotSession(conversation.id, "menu", ingest.message_id);
      return;
    }

    await sendBotText(botContext, intent === "menu" ? buildWhatsAppBotMenu(store.name) : `Não entendi essa opção.\n\n${buildWhatsAppBotMenu(store.name)}`, responseKey);
    await updateBotSession(conversation.id, "menu", ingest.message_id);
  }
}
