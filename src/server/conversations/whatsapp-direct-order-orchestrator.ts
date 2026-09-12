import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildWhatsAppBotMenu, normalizeBotInput, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import {
  isWhatsAppOrderStep,
  looksLikeWhatsAppOrderItems,
  WhatsAppOrderService,
  whatsappOrderStartMessage,
  type WhatsAppOrderContext,
  type WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-order-service";
import { recordFailure } from "@/server/observability/failure";

type IngestResult = {
  conversation_id?: string;
  message_id?: string;
  message_created?: boolean;
};

type ClaimedOutbound = {
  claimed?: boolean;
  message_id?: string;
};

async function sendBotText(input: {
  requestId: string;
  conversationId: string;
  organizationId: string;
  storeId: string;
  phoneNumberId: string;
  accessTokenSecretRef: string;
  recipient: string;
  body: string;
  clientMessageId: string;
}) {
  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin.rpc("conversation_claim_bot_outbound_internal", {
    p_conversation_id: input.conversationId,
    p_body: input.body,
    p_client_message_id: input.clientMessageId,
  });
  if (claimError) throw claimError;
  const claimed = claim as ClaimedOutbound | null;
  if (!claimed?.claimed || !claimed.message_id) return "duplicate" as const;

  try {
    const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(input.accessTokenSecretRef));
    const sent = await provider.sendText({ phoneNumberId: input.phoneNumberId, recipient: input.recipient, body: input.body });
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
    recordFailure("whatsapp.order_bot.send_failed", error, {
      requestId: input.requestId,
      organizationId: input.organizationId,
      storeId: input.storeId,
    });
    await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimed.message_id,
      p_external_message_id: null,
      p_status: "failed",
      p_error_code: "provider_error",
      p_error_message: safeWhatsAppFailureMessage(error),
    });
    await admin.rpc("conversation_transition_internal", {
      p_conversation_id: input.conversationId,
      p_target_state: "waiting_agent",
      p_assigned_user_id: null,
      p_reason: "Falha no envio automático durante pedido pelo WhatsApp",
      p_actor_user_id: null,
      p_source: "bot",
    });
    return "failed" as const;
  }
}

async function saveSession(conversationId: string, step: WhatsAppOrderStep | "menu", messageId: string, context: WhatsAppOrderContext | null) {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const { error } = await admin.rpc("automation_session_upsert_internal", {
    p_conversation_id: conversationId,
    p_step: step,
    p_context: context ?? { channel: "whatsapp_menu", version: 3 },
    p_last_input_message_id: messageId,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
}

function wantsHuman(text: string) {
  const normalized = normalizeBotInput(text);
  return normalized === "3" || normalized.includes("atendente") || normalized.includes("humano") || normalized.includes("falar com restaurante");
}

export class WhatsAppDirectOrderOrchestrator {
  static async afterInbound(result: unknown, requestId: string): Promise<boolean> {
    const ingest = result && typeof result === "object" ? result as IngestResult : null;
    if (!ingest?.conversation_id || !ingest.message_id || ingest.message_created === false) return false;

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, organization_id, store_id, contact_id, channel, status")
      .eq("id", ingest.conversation_id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation || conversation.channel !== "whatsapp" || conversation.status !== "bot") return false;

    const [settingsResult, contactResult, storeResult, inboundResult, sessionResult] = await Promise.all([
      admin.from("store_conversation_settings")
        .select("whatsapp_orders_enabled, whatsapp_enabled, whatsapp_phone_number_id, access_token_secret_ref, default_bot_enabled, bot_display_name, handoff_message")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .maybeSingle(),
      admin.from("contacts")
        .select("external_id, phone_normalized, name")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("id", conversation.contact_id)
        .maybeSingle(),
      admin.from("stores")
        .select("name, slug, status")
        .eq("organization_id", conversation.organization_id)
        .eq("id", conversation.store_id)
        .maybeSingle(),
      admin.from("messages")
        .select("body, content_type")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .eq("id", ingest.message_id)
        .maybeSingle(),
      admin.from("automation_sessions")
        .select("step, state, context, expires_at")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .maybeSingle(),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (contactResult.error) throw contactResult.error;
    if (storeResult.error) throw storeResult.error;
    if (inboundResult.error) throw inboundResult.error;
    if (sessionResult.error) throw sessionResult.error;

    const settings = settingsResult.data;
    const contact = contactResult.data;
    const store = storeResult.data;
    const inbound = inboundResult.data;
    const session = sessionResult.data;
    if (!settings?.whatsapp_orders_enabled || !settings.default_bot_enabled || !settings.whatsapp_enabled) return false;
    if (!settings.whatsapp_phone_number_id || !settings.access_token_secret_ref || !contact?.external_id || !store?.slug || !store.name || store.status !== "active") return false;
    if (!inbound || (inbound.content_type !== "text" && inbound.content_type !== "interactive")) return false;

    const active = session?.state === "active" && (!session.expires_at || Date.parse(session.expires_at) > Date.now());
    const activeOrderStep = active && isWhatsAppOrderStep(session?.step) ? session.step : null;
    const intent = resolveWhatsAppBotIntent(inbound.body, "menu");
    const naturalOrder = looksLikeWhatsAppOrderItems(inbound.body);
    if (!activeOrderStep && intent !== "order_start" && !naturalOrder) return false;

    const sendBase = {
      requestId,
      conversationId: conversation.id,
      organizationId: conversation.organization_id,
      storeId: conversation.store_id,
      phoneNumberId: settings.whatsapp_phone_number_id,
      accessTokenSecretRef: settings.access_token_secret_ref,
      recipient: contact.external_id,
    };

    if (activeOrderStep && normalizeBotInput(inbound.body) === "menu") {
      const body = buildWhatsAppBotMenu(store.name, true, settings.bot_display_name);
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:menu:${ingest.message_id}` });
      await saveSession(conversation.id, "menu", ingest.message_id, null);
      return true;
    }

    if (activeOrderStep && wantsHuman(inbound.body)) {
      await sendBotText({
        ...sendBase,
        body: `Parei a montagem do pedido. ${settings.handoff_message}`,
        clientMessageId: `auto:wa-order:handoff:${ingest.message_id}`,
      });
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: "Cliente pediu atendimento humano durante pedido pelo WhatsApp",
        p_actor_user_id: null,
        p_source: "bot",
      });
      await saveSession(conversation.id, "menu", ingest.message_id, null);
      return true;
    }

    if (!activeOrderStep && intent === "order_start" && !naturalOrder) {
      const body = whatsappOrderStartMessage(store.name);
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:start:${ingest.message_id}` });
      await saveSession(conversation.id, "order_items", ingest.message_id, { channel: "whatsapp_order", version: 1 });
      return true;
    }

    const handled = await WhatsAppOrderService.handle({
      organizationId: conversation.organization_id,
      storeId: conversation.store_id,
      storeSlug: store.slug,
      storeName: store.name,
      contactName: contact.name,
      contactPhone: contact.phone_normalized ?? contact.external_id,
      text: inbound.body,
      step: activeOrderStep ?? "order_items",
      context: activeOrderStep ? session?.context : { channel: "whatsapp_order", version: 1 },
    });
    await sendBotText({ ...sendBase, body: handled.body, clientMessageId: `auto:wa-order:${ingest.message_id}` });
    await saveSession(conversation.id, handled.nextStep, ingest.message_id, handled.context);
    return true;
  }
}
