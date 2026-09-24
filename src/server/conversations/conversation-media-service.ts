import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import {
  CONVERSATION_MEDIA_BUCKET,
  ConversationMediaValidationError,
  conversationMediaPath,
  maxInboundMediaBytes,
  safeMediaFilename,
  validateConversationMedia,
  type ConversationMediaKind,
} from "@/server/conversations/media-policy";
import { resolveWhatsAppAccessToken, resolveWhatsAppGraphVersion } from "@/server/conversations/provider";
import { logger } from "@/server/observability/logger";

type PendingMedia = {
  id: string;
  organization_id: string;
  store_id: string;
  conversation_id: string;
  message_id: string;
  media_kind: ConversationMediaKind;
  provider_media_id: string | null;
  declared_mime_type: string | null;
  original_filename: string | null;
  status: string;
};

const PROVIDER_MEDIA_TIMEOUT_MS = 20_000;

function safeProviderMediaUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const allowed = ["facebook.com", "fbcdn.net", "fbsbx.com", "whatsapp.net"];
  if (url.protocol !== "https:" || !allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new ConversationMediaValidationError("provider_media_url_rejected", "A Meta retornou uma origem de mídia inválida.");
  }
  return url;
}

function failureKind(error: unknown) {
  if (error instanceof ConversationMediaValidationError) return error.kind;
  if (error instanceof DOMException && error.name === "TimeoutError") return "provider_media_timeout";
  return "provider_media_download_failed";
}

async function processOne(row: PendingMedia, accessToken: string) {
  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.from("message_media")
    .update({ status: "processing", failure_kind: null, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed || !row.provider_media_id) return false;

  try {
    const version = resolveWhatsAppGraphVersion();
    const metadataResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(row.provider_media_id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_MEDIA_TIMEOUT_MS),
    });
    const providerMetadata = await metadataResponse.json().catch(() => null) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    } | null;
    if (!metadataResponse.ok || !providerMetadata?.url) throw new Error("provider_media_metadata_failed");
    const maximum = maxInboundMediaBytes(row.media_kind);
    if (providerMetadata.file_size && providerMetadata.file_size > maximum) {
      throw new ConversationMediaValidationError("media_size_rejected", "A mídia excede o limite permitido.");
    }

    const mediaResponse = await fetch(safeProviderMediaUrl(providerMetadata.url), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_MEDIA_TIMEOUT_MS),
    });
    if (!mediaResponse.ok) throw new Error("provider_media_download_failed");
    const contentLength = Number(mediaResponse.headers.get("content-length") ?? 0);
    if (contentLength > maximum) throw new ConversationMediaValidationError("media_size_rejected", "A mídia excede o limite permitido.");
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    const declaredMime = providerMetadata.mime_type ?? row.declared_mime_type ?? mediaResponse.headers.get("content-type") ?? "";
    const validated = validateConversationMedia(bytes, declaredMime, row.media_kind, maximum);
    const path = conversationMediaPath({
      organizationId: row.organization_id,
      storeId: row.store_id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      extension: validated.extension,
    });
    const { error: uploadError } = await admin.storage.from(CONVERSATION_MEDIA_BUCKET).upload(path, bytes, {
      contentType: validated.mimeType,
      cacheControl: "0",
      upsert: false,
    });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
    const { error: updateError } = await admin.from("message_media").update({
      storage_path: path,
      mime_type: validated.mimeType,
      size_bytes: validated.sizeBytes,
      sha256: validated.sha256,
      status: "ready",
      failure_kind: null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("organization_id", row.organization_id).eq("store_id", row.store_id);
    if (updateError) throw updateError;
    logger.info("conversation_media_ready", {
      organizationId: row.organization_id,
      storeId: row.store_id,
      mediaKind: row.media_kind,
      sizeBytes: validated.sizeBytes,
    });
    return true;
  } catch (error) {
    const kind = failureKind(error);
    await admin.from("message_media").update({ status: "failed", failure_kind: kind, updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("organization_id", row.organization_id).eq("store_id", row.store_id);
    logger.warn("conversation_media_failed", {
      organizationId: row.organization_id,
      storeId: row.store_id,
      mediaKind: row.media_kind,
      failureKind: kind,
    });
    return false;
  }
}

export class ConversationMediaService {
  static async processPendingForPhoneNumber(phoneNumberId: string) {
    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin.from("store_conversation_settings")
      .select("organization_id,store_id,whatsapp_enabled,access_token_secret_ref")
      .eq("provider", "meta_cloud")
      .eq("whatsapp_phone_number_id", phoneNumberId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.whatsapp_enabled) return { processed: 0 };
    const { data, error } = await admin.from("message_media")
      .select("id,organization_id,store_id,conversation_id,message_id,media_kind,provider_media_id,declared_mime_type,original_filename,status")
      .eq("organization_id", settings.organization_id)
      .eq("store_id", settings.store_id)
      .eq("status", "pending")
      .not("provider_media_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) throw error;
    const accessToken = resolveWhatsAppAccessToken(settings.access_token_secret_ref);
    let processed = 0;
    for (const item of (data ?? []) as PendingMedia[]) {
      if (await processOne(item, accessToken)) processed += 1;
    }
    return { processed };
  }

  static async signedUrl(conversationId: string, mediaId: string, download: boolean) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    if (!context.storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
    const admin = createAdminClient();
    const { data, error } = await admin.from("message_media")
      .select("id,storage_bucket,storage_path,mime_type,original_filename,status")
      .eq("id", mediaId)
      .eq("conversation_id", conversationId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "ready" || !data.storage_path || !data.mime_type) throw new Error("Mídia indisponível.");
    const filename = safeMediaFilename(data.original_filename, data.mime_type);
    const { data: signed, error: signedError } = await admin.storage.from(data.storage_bucket).createSignedUrl(
      data.storage_path,
      60,
      download ? { download: filename } : undefined,
    );
    if (signedError) throw signedError;
    return signed.signedUrl;
  }
}
