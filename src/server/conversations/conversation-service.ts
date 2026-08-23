import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { messagePreview, type ConversationStatus } from "@/server/conversations/model";
import { inboxFilterSchema, conversationReplyInputSchema, conversationTransitionInputSchema, type ConversationReplyInput, type ConversationTransitionInput } from "@/server/conversations/schemas";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, resolveWhatsAppAppSecret, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import type { WhatsAppWebhookEvent } from "@/server/conversations/whatsapp-webhook";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  return storeId;
}

async function scopedConversation(conversationId: string, organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("conversations")
    .select("id, organization_id, store_id, contact_id, channel, status, assigned_user_id, unread_count, last_message_at, opened_at, closed_at")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Conversa não encontrada nesta unidade.");
  return data;
}

export class ConversationService {
  static async loadInbox(filterInput?: string) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const filter = inboxFilterSchema.catch("all").parse(filterInput);

    let query = admin.from("conversations")
      .select("id, contact_id, channel, status, assigned_user_id, unread_count, last_message_at, opened_at, closed_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("opened_at", { ascending: false })
      .limit(120);
    if (filter !== "all") query = query.eq("status", filter);

    const [conversationResult, settingsResult] = await Promise.all([
      query,
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled, whatsapp_phone_number_id, ai_enabled, default_bot_enabled")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);
    if (conversationResult.error) throw conversationResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const conversations = conversationResult.data ?? [];
    const contactIds = [...new Set(conversations.map((row) => row.contact_id))];
    const conversationIds = conversations.map((row) => row.id);

    const [contactsResult, messagesResult] = await Promise.all([
      contactIds.length > 0
        ? admin.from("contacts").select("id, name, phone_normalized, external_id, customer_id, channel").eq("organization_id", context.organizationId).eq("store_id", storeId).in("id", contactIds)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length > 0
        ? admin.from("messages").select("conversation_id, body, content_type, direction, created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (contactsResult.error) throw contactsResult.error;
    if (messagesResult.error) throw messagesResult.error;

    const contactMap = new Map((contactsResult.data ?? []).map((contact) => [contact.id, contact]));
    const latestMessage = new Map<string, { body: string | null; content_type: string; direction: string; created_at: string }>();
    for (const message of messagesResult.data ?? []) {
      if (!latestMessage.has(message.conversation_id)) latestMessage.set(message.conversation_id, message);
    }

    const rows = conversations.map((conversation) => {
      const contact = contactMap.get(conversation.contact_id);
      const latest = latestMessage.get(conversation.id);
      return {
        ...conversation,
        contactName: contact?.name ?? contact?.phone_normalized ?? "Contato",
        phone: contact?.phone_normalized ?? null,
        customerId: contact?.customer_id ?? null,
        preview: messagePreview(latest?.body),
        latestDirection: latest?.direction ?? null,
      };
    });

    return {
      filter,
      conversations: rows,
      counts: {
        total: conversations.length,
        bot: conversations.filter((row) => row.status === "bot").length,
        waiting: conversations.filter((row) => row.status === "waiting_agent").length,
        human: conversations.filter((row) => row.status === "human").length,
        unread: conversations.reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0),
      },
      integration: {
        configured: Boolean(settingsResult.data?.whatsapp_phone_number_id),
        enabled: Boolean(settingsResult.data?.whatsapp_enabled),
        aiEnabled: Boolean(settingsResult.data?.ai_enabled),
        botEnabled: settingsResult.data?.default_bot_enabled ?? true,
      },
    };
  }

  static async loadConversation(conversationId: string) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const conversation = await scopedConversation(conversationId, context.organizationId, storeId);

    const [contactResult, messagesResult, historyResult] = await Promise.all([
      admin.from("contacts").select("id, name, phone_normalized, external_id, customer_id, channel").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("id", conversation.contact_id).maybeSingle(),
      admin.from("messages").select("id, direction, sender_type, sender_user_id, content_type, body, delivery_status, external_message_id, error_message, provider_timestamp, created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(250),
      admin.from("conversation_state_history").select("id, from_state, to_state, assigned_user_id, reason, source, actor_user_id, created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(100),
    ]);
    if (contactResult.error) throw contactResult.error;
    if (messagesResult.error) throw messagesResult.error;
    if (historyResult.error) throw historyResult.error;

    return {
      conversation,
      contact: contactResult.data,
      messages: messagesResult.data ?? [],
      history: historyResult.data ?? [],
      currentUserId: context.userId,
    };
  }

  static async transition(input: ConversationTransitionInput) {
    const values = conversationTransitionInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    await scopedConversation(values.conversationId, context.organizationId, storeId);

    const assignedUserId = values.targetState === "human" ? context.userId : null;
    const { data, error } = await admin.rpc("conversation_transition_internal", {
      p_conversation_id: values.conversationId,
      p_target_state: values.targetState,
      p_assigned_user_id: assignedUserId,
      p_reason: values.reason ?? null,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (error) throw error;
    return data;
  }

  static async markRead(conversationId: string) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    await scopedConversation(conversationId, context.organizationId, storeId);
    const { data, error } = await admin.rpc("conversation_mark_read_internal", { p_conversation_id: conversationId });
    if (error) throw error;
    return data;
  }

  static async sendAgentText(input: ConversationReplyInput) {
    const values = conversationReplyInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.CONVERSATIONS_REPLY);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const conversation = await scopedConversation(values.conversationId, context.organizationId, storeId);
    if (conversation.status !== "human" || conversation.assigned_user_id !== context.userId) {
      throw new Error("Assuma esta conversa antes de responder.");
    }

    const [{ data: contact, error: contactError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("contacts").select("external_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("id", conversation.contact_id).maybeSingle(),
      admin.from("store_conversation_settings").select("whatsapp_enabled, whatsapp_phone_number_id, access_token_secret_ref").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    if (contactError) throw contactError;
    if (settingsError) throw settingsError;
    if (conversation.channel !== "whatsapp") throw new Error("Canal ainda não possui provider de saída.");
    if (!settings?.whatsapp_enabled || !settings.whatsapp_phone_number_id) throw new Error("WhatsApp ainda não está configurado para esta unidade.");
    if (!contact?.external_id) throw new Error("Contato sem identificador externo do WhatsApp.");

    const clientMessageId = values.clientMessageId || `agent:${randomUUID()}`;
    const { data: pending, error: pendingError } = await admin.rpc("conversation_create_outbound_internal", {
      p_conversation_id: conversation.id,
      p_body: values.body,
      p_client_message_id: clientMessageId,
      p_sender_type: "agent",
      p_actor_user_id: context.userId,
    });
    if (pendingError) throw pendingError;
    if (!pending?.id) throw new Error("Não foi possível preparar a mensagem.");
    if (pending.delivery_status === "sent" || pending.delivery_status === "delivered" || pending.delivery_status === "read") return pending;

    try {
      const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(settings.access_token_secret_ref));
      const sent = await provider.sendText({
        phoneNumberId: settings.whatsapp_phone_number_id,
        recipient: contact.external_id,
        body: values.body,
      });
      const { data, error } = await admin.rpc("conversation_mark_outbound_result_internal", {
        p_message_id: pending.id,
        p_external_message_id: sent.externalMessageId,
        p_status: "sent",
        p_error_code: null,
        p_error_message: null,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      const message = safeWhatsAppFailureMessage(error);
      await admin.rpc("conversation_mark_outbound_result_internal", {
        p_message_id: pending.id,
        p_external_message_id: null,
        p_status: "failed",
        p_error_code: "provider_error",
        p_error_message: message,
      });
      throw new Error(message);
    }
  }

  static async resolveWebhookAppSecret(phoneNumberId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_conversation_settings")
      .select("app_secret_secret_ref, whatsapp_enabled")
      .eq("provider", "meta_cloud")
      .eq("whatsapp_phone_number_id", phoneNumberId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.whatsapp_enabled) throw new Error("WhatsApp não habilitado para este número.");
    return resolveWhatsAppAppSecret(data.app_secret_secret_ref);
  }

  static async ingestWhatsAppEvent(event: WhatsAppWebhookEvent) {
    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin.from("store_conversation_settings")
      .select("organization_id, store_id, whatsapp_enabled")
      .eq("provider", "meta_cloud")
      .eq("whatsapp_phone_number_id", event.phoneNumberId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.whatsapp_enabled) throw new Error("Evento recebido para número não habilitado.");

    if (event.kind === "message") {
      const { data, error } = await admin.rpc("conversation_receive_message_internal", {
        p_store_id: settings.store_id,
        p_provider: "meta_cloud",
        p_external_contact_id: event.externalContactId,
        p_phone_normalized: event.phoneNormalized,
        p_contact_name: event.contactName,
        p_external_message_id: event.externalMessageId,
        p_body: event.body,
        p_content_type: event.contentType,
        p_provider_timestamp: event.providerTimestamp,
        p_metadata: event.metadata,
      });
      if (error) throw error;
      return data;
    }

    const { data, error } = await admin.rpc("conversation_update_delivery_internal", {
      p_store_id: settings.store_id,
      p_provider: "meta_cloud",
      p_external_message_id: event.externalMessageId,
      p_status: event.status,
      p_error_code: event.errorCode,
      p_error_message: event.errorMessage,
    });
    if (error) throw error;
    const { error: campaignError } = await admin.rpc("campaign_update_delivery_internal", {
      p_store_id: settings.store_id,
      p_provider_message_id: event.externalMessageId,
      p_status: event.status,
      p_error_code: event.errorCode,
      p_reason: event.errorMessage,
    });
    if (campaignError) throw campaignError;
    return data;
  }

  static newClientMessageId() {
    return `agent:${randomUUID()}`;
  }

  static statusForUi(status: string) {
    return status as ConversationStatus;
  }
}
