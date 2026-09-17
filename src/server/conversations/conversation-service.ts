import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { messagePreview, type ConversationStatus } from "@/server/conversations/model";
import { inboxFilterSchema, conversationReplyInputSchema, conversationTransitionInputSchema, type ConversationReplyInput, type ConversationTransitionInput } from "@/server/conversations/schemas";
import { CONVERSATION_MEDIA_BUCKET, MAX_AGENT_MEDIA_BYTES, conversationMediaPath, safeMediaFilename, validateConversationMedia, type ConversationMediaKind } from "@/server/conversations/media-policy";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, resolveWhatsAppAppSecret, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import type { WhatsAppWebhookEvent } from "@/server/conversations/whatsapp-webhook";

const INBOX_PAGE_SIZE = 40;
const MESSAGE_PAGE_SIZE = 80;

type CursorValue = {
  at: string;
  id: string;
};

type InboxLoadInput = {
  filter?: string;
  search?: string;
  unreadOnly?: boolean;
  cursor?: string | null;
};

type MessagePageInput = {
  before?: string | null;
  after?: string | null;
};

type InboxRpcRow = {
  id: string;
  contact_id: string;
  channel: string;
  status: string;
  assigned_user_id: string | null;
  unread_count: number | string | null;
  last_message_at: string | null;
  opened_at: string;
  closed_at: string | null;
  contact_name: string | null;
  phone: string | null;
  customer_id: string | null;
  activity_at: string;
  preview_body: string | null;
  preview_content_type: string | null;
  latest_direction: string | null;
  latest_message_created_at: string | null;
};

export type ConversationMessageRow = {
  id: string;
  direction: string;
  sender_type: string | null;
  sender_user_id: string | null;
  content_type: string;
  body: string | null;
  delivery_status: string | null;
  external_message_id: string | null;
  error_message: string | null;
  provider_timestamp: string | null;
  metadata: unknown;
  created_at: string;
  media?: {
    id: string;
    kind: ConversationMediaKind;
    mimeType: string | null;
    filename: string | null;
    caption: string | null;
    isVoice: boolean;
    sizeBytes: number | null;
    status: string;
    failureKind: string | null;
  } | null;
};

export type ConversationMessagePage = {
  messages: ConversationMessageRow[];
  previousCursor: string | null;
  latestCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
};

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  return storeId;
}

function encodeCursor(value: CursorValue) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | null | undefined): CursorValue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorValue>;
    if (typeof parsed.at !== "string" || typeof parsed.id !== "string") return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) return null;
    const date = new Date(parsed.at);
    if (Number.isNaN(date.getTime())) return null;
    return { at: date.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRows<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 80);
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

async function loadMessagePageForScope(
  organizationId: string,
  storeId: string,
  conversationId: string,
  input?: MessagePageInput,
): Promise<ConversationMessagePage> {
  const admin = createAdminClient();
  const before = decodeCursor(input?.before);
  const after = decodeCursor(input?.after);
  if (input?.before && !before) throw new Error("Cursor de mensagens anteriores inválido.");
  if (input?.after && !after) throw new Error("Cursor de novas mensagens inválido.");
  if (before && after) throw new Error("Use somente um cursor de mensagens por vez.");

  const { data, error } = await admin.rpc("conversation_message_page_internal", {
    p_organization_id: organizationId,
    p_store_id: storeId,
    p_conversation_id: conversationId,
    p_before_created_at: before?.at ?? null,
    p_before_id: before?.id ?? null,
    p_after_created_at: after?.at ?? null,
    p_after_id: after?.id ?? null,
    p_limit: MESSAGE_PAGE_SIZE,
  });
  if (error) throw error;

  const payload = asRecord(data);
  const rawRows = asRows<ConversationMessageRow>(payload.rows);
  const hasMore = rawRows.length > MESSAGE_PAGE_SIZE;
  const pageRows = hasMore
    ? after
      ? rawRows.slice(0, MESSAGE_PAGE_SIZE)
      : rawRows.slice(rawRows.length - MESSAGE_PAGE_SIZE)
    : rawRows;
  const first = pageRows[0];
  const last = pageRows[pageRows.length - 1];

  const ids = pageRows.map((row) => row.id);
  const mediaByMessage = new Map<string, NonNullable<ConversationMessageRow["media"]>>();
  if (ids.length > 0) {
    const { data: mediaRows, error: mediaError } = await admin.from("message_media")
      .select("id,message_id,media_kind,mime_type,original_filename,caption,is_voice,size_bytes,status,failure_kind")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("conversation_id", conversationId)
      .in("message_id", ids);
    if (mediaError) throw mediaError;
    for (const media of mediaRows ?? []) {
      mediaByMessage.set(media.message_id, {
        id: media.id,
        kind: media.media_kind as ConversationMediaKind,
        mimeType: media.mime_type,
        filename: media.original_filename,
        caption: media.caption,
        isVoice: Boolean(media.is_voice),
        sizeBytes: media.size_bytes === null ? null : Number(media.size_bytes),
        status: media.status,
        failureKind: media.failure_kind,
      });
    }
  }
  const messages = pageRows.map((row) => ({ ...row, media: mediaByMessage.get(row.id) ?? null }));

  return {
    messages,
    previousCursor: first ? encodeCursor({ at: first.created_at, id: first.id }) : null,
    latestCursor: last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
    hasOlder: !after && hasMore,
    hasNewer: Boolean(after) && hasMore,
  };
}

export class ConversationService {
  static async loadInbox(input?: string | InboxLoadInput) {
    const options: InboxLoadInput = typeof input === "string" ? { filter: input } : input ?? {};
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const filter = inboxFilterSchema.catch("all").parse(options.filter);
    const search = normalizeSearch(options.search);
    const cursor = decodeCursor(options.cursor);

    const [inboxResult, settingsResult] = await Promise.all([
      admin.rpc("conversation_inbox_page_internal", {
        p_organization_id: context.organizationId,
        p_store_id: storeId,
        p_status: filter === "all" ? null : filter,
        p_unread_only: Boolean(options.unreadOnly),
        p_search: search || null,
        p_before_activity: cursor?.at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: INBOX_PAGE_SIZE,
      }),
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled, whatsapp_phone_number_id, ai_enabled, default_bot_enabled")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);
    if (inboxResult.error) throw inboxResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const payload = asRecord(inboxResult.data);
    const rawRows = asRows<InboxRpcRow>(payload.rows);
    const hasMore = rawRows.length > INBOX_PAGE_SIZE;
    const pageRows = rawRows.slice(0, INBOX_PAGE_SIZE);
    const last = pageRows[pageRows.length - 1];

    const conversations = pageRows.map((row) => ({
      id: row.id,
      contact_id: row.contact_id,
      channel: row.channel,
      status: row.status,
      assigned_user_id: row.assigned_user_id,
      unread_count: Number(row.unread_count ?? 0),
      last_message_at: row.last_message_at,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      contactName: row.contact_name ?? row.phone ?? "Contato",
      phone: row.phone,
      customerId: row.customer_id,
      preview: messagePreview(row.preview_body),
      latestDirection: row.latest_direction,
      activityAt: row.activity_at,
    }));

    return {
      filter,
      search,
      unreadOnly: Boolean(options.unreadOnly),
      conversations,
      pageInfo: {
        hasMore,
        nextCursor: hasMore && last ? encodeCursor({ at: last.activity_at, id: last.id }) : null,
      },
      counts: {
        total: Number(payload.total ?? conversations.length),
        unreadConversations: Number(payload.unread_conversations ?? 0),
        unread: Number(payload.unread_messages ?? 0),
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

    const [contactResult, messagePage, historyResult] = await Promise.all([
      admin.from("contacts").select("id, name, phone_normalized, external_id, customer_id, channel").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("id", conversation.contact_id).maybeSingle(),
      loadMessagePageForScope(context.organizationId, storeId, conversation.id),
      admin.from("conversation_state_history").select("id, from_state, to_state, assigned_user_id, reason, source, actor_user_id, created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(100),
    ]);
    if (contactResult.error) throw contactResult.error;
    if (historyResult.error) throw historyResult.error;

    return {
      conversation,
      contact: contactResult.data,
      messages: messagePage.messages,
      messagePagination: {
        previousCursor: messagePage.previousCursor,
        latestCursor: messagePage.latestCursor,
        hasOlder: messagePage.hasOlder,
      },
      history: historyResult.data ?? [],
      currentUserId: context.userId,
    };
  }

  static async loadConversationMessages(conversationId: string, input?: MessagePageInput) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(context.storeId);
    await scopedConversation(conversationId, context.organizationId, storeId);
    return loadMessagePageForScope(context.organizationId, storeId, conversationId, input);
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

  static async sendAgentMedia(input: {
    conversationId: string;
    file: File;
    caption?: string;
    clientMessageId?: string;
  }) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_REPLY);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const conversation = await scopedConversation(input.conversationId, context.organizationId, storeId);
    if (conversation.status !== "human" || conversation.assigned_user_id !== context.userId) {
      throw new Error("Assuma esta conversa antes de responder.");
    }
    if (!(input.file instanceof File) || input.file.size <= 0 || input.file.size > MAX_AGENT_MEDIA_BYTES) {
      throw new Error("O anexo deve ter no máximo 4 MB.");
    }
    const [{ data: contact, error: contactError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("contacts").select("external_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("id", conversation.contact_id).maybeSingle(),
      admin.from("store_conversation_settings").select("whatsapp_enabled,whatsapp_phone_number_id,access_token_secret_ref").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    if (contactError) throw contactError;
    if (settingsError) throw settingsError;
    if (conversation.channel !== "whatsapp" || !settings?.whatsapp_enabled || !settings.whatsapp_phone_number_id || !contact?.external_id) {
      throw new Error("WhatsApp ainda não está configurado para esta unidade.");
    }

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const guessedKind: ConversationMediaKind = input.file.type.startsWith("image/") ? "image"
      : input.file.type.startsWith("audio/") ? "audio"
        : input.file.type.startsWith("video/") ? "video" : "document";
    const validated = validateConversationMedia(bytes, input.file.type, guessedKind, MAX_AGENT_MEDIA_BYTES);
    const clientMessageId = input.clientMessageId || `agent-media:${randomUUID()}`;
    const caption = (input.caption ?? "").trim().slice(0, 1024);
    const filename = safeMediaFilename(input.file.name, validated.mimeType);
    const { data: pending, error: pendingError } = await admin.rpc("conversation_create_outbound_media_internal", {
      p_conversation_id: conversation.id,
      p_body: caption || null,
      p_client_message_id: clientMessageId,
      p_content_type: guessedKind,
      p_original_filename: filename,
      p_declared_mime_type: validated.mimeType,
      p_actor_user_id: context.userId,
    });
    if (pendingError) throw pendingError;
    if (!pending?.id) throw new Error("Não foi possível preparar o anexo.");
    if (["sent", "delivered", "read"].includes(pending.delivery_status)) return pending;
    const { data: claimed, error: claimError } = await admin.rpc("conversation_claim_outbound_media_internal", {
      p_message_id: pending.id,
      p_actor_user_id: context.userId,
    });
    if (claimError) throw claimError;
    if (claimed !== true) return pending;

    const { data: existingMedia, error: existingMediaError } = await admin.from("message_media")
      .select("provider_media_id")
      .eq("message_id", pending.id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (existingMediaError) throw existingMediaError;

    const path = conversationMediaPath({
      organizationId: context.organizationId,
      storeId,
      conversationId: conversation.id,
      messageId: pending.id,
      extension: validated.extension,
    });
    try {
      const { error: uploadError } = await admin.storage.from(CONVERSATION_MEDIA_BUCKET).upload(path, bytes, {
        contentType: validated.mimeType,
        cacheControl: "0",
        upsert: false,
      });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
      const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(settings.access_token_secret_ref));
      const providerMediaId = existingMedia?.provider_media_id || (await provider.uploadMedia({
        phoneNumberId: settings.whatsapp_phone_number_id,
        bytes,
        mimeType: validated.mimeType,
        filename,
      })).mediaId;
      const { error: mediaError } = await admin.from("message_media").update({
        provider_media_id: providerMediaId,
        storage_path: path,
        mime_type: validated.mimeType,
        size_bytes: validated.sizeBytes,
        sha256: validated.sha256,
        status: "ready",
        failure_kind: null,
        updated_at: new Date().toISOString(),
      }).eq("message_id", pending.id).eq("organization_id", context.organizationId).eq("store_id", storeId);
      if (mediaError) throw mediaError;
      const sent = await provider.sendMedia({
        phoneNumberId: settings.whatsapp_phone_number_id,
        recipient: contact.external_id,
        mediaId: providerMediaId,
        mediaType: guessedKind,
        caption: caption || null,
        filename,
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
      await admin.from("message_media").update({ send_claimed_at: null, updated_at: new Date().toISOString() })
        .eq("message_id", pending.id).eq("organization_id", context.organizationId).eq("store_id", storeId);
      await admin.rpc("conversation_mark_outbound_result_internal", {
        p_message_id: pending.id,
        p_external_message_id: null,
        p_status: "failed",
        p_error_code: "media_provider_error",
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
