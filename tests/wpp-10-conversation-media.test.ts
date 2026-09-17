import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectConversationMediaMime, safeMediaFilename, validateConversationMedia } from "@/server/conversations/media-policy";
import { parseWhatsAppWebhook } from "@/server/conversations/whatsapp-webhook";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260917224308_wpp10_conversation_media.sql");
const legacyMigration = read("supabase/migrations/20260917230251_wpp10_legacy_media_state.sql");
const mediaService = read("src/server/conversations/conversation-media-service.ts");
const conversationService = read("src/server/conversations/conversation-service.ts");
const provider = read("src/server/conversations/provider.ts");
const route = read("src/app/api/conversations/[conversationId]/media/[mediaId]/route.ts");
const timeline = read("src/app/(app)/conversas/conversation-timeline.tsx");
const webhookRoute = read("src/app/api/webhooks/whatsapp/route.ts");
const nextConfig = read("next.config.ts");

function payload(field: string, value: Record<string, unknown>) {
  return { entry: [{ changes: [{ field, value: { metadata: { phone_number_id: "phone-1" }, ...value } }] }] };
}

describe("WPP-10 private conversation media", () => {
  it("normalizes inbound media metadata without storing provider URLs or tokens", () => {
    const events = parseWhatsAppWebhook(payload("messages", {
      contacts: [{ wa_id: "5511999999999", profile: { name: "Cliente" } }],
      messages: [{
        id: "wamid.image-1", from: "5511999999999", timestamp: "1789689600", type: "image",
        image: { id: "meta-media-1", mime_type: "image/jpeg", caption: "Foto do pedido", url: "https://must-not-persist.example", access_token: "secret" },
      }],
    }));
    expect(events[0]).toMatchObject({
      kind: "message", contentType: "image", body: "Foto do pedido",
      metadata: { media_id: "meta-media-1", media_mime_type: "image/jpeg", media_caption: "Foto do pedido" },
    });
    expect(JSON.stringify(events[0])).not.toContain("must-not-persist");
    expect(JSON.stringify(events[0])).not.toContain("secret");
  });

  it("preserves voice, filename and safe location fields across coexistence payloads", () => {
    const echo = parseWhatsAppWebhook(payload("smb_message_echoes", {
      message_echoes: [{ id: "wamid.voice", to: "5511888888888", type: "audio", audio: { id: "audio-1", mime_type: "audio/ogg", voice: true } }],
    }))[0];
    expect(echo).toMatchObject({ kind: "echo", metadata: { media_id: "audio-1", media_voice: true, source: "whatsapp_business_app" } });

    const location = parseWhatsAppWebhook(payload("messages", {
      messages: [{ id: "wamid.location", from: "5511777777777", type: "location", location: { latitude: -22.78, longitude: -47.29, name: "Loja", address: "Rua segura" } }],
    }))[0];
    expect(location).toMatchObject({ contentType: "location", metadata: { location_latitude: -22.78, location_longitude: -47.29, location_name: "Loja" } });
  });

  it("rejects spoofed MIME and executable HTML/SVG while accepting real signatures", () => {
    const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
    expect(detectConversationMediaMime(png, "image/png")).toBe("image/png");
    expect(validateConversationMedia(png, "image/png", "image").mimeType).toBe("image/png");
    expect(() => validateConversationMedia(new TextEncoder().encode("<svg><script/></svg>"), "image/svg+xml", "image")).toThrow(/conteúdo real/i);
    expect(() => validateConversationMedia(new TextEncoder().encode("<html>bad</html>"), "application/pdf", "document")).toThrow(/conteúdo real/i);
    expect(safeMediaFilename("../../nota<script>.pdf", "application/pdf")).not.toMatch(/[<>]/);
  });

  it("keeps storage private, scoped and service-role only", () => {
    expect(migration).toContain("'conversation-media',\n  'conversation-media',\n  false");
    expect(migration).toContain("alter table public.message_media enable row level security");
    expect(migration).toContain("revoke all on table public.message_media from public, anon, authenticated");
    expect(migration).toContain("organization_id::text || '/' || store_id::text || '/' || conversation_id::text || '/' || message_id::text");
    expect(mediaService).toContain('.eq("organization_id", context.organizationId)');
    expect(mediaService).toContain('.eq("store_id", context.storeId)');
    expect(mediaService).toContain("createSignedUrl");
    expect(route).toContain("ConversationMediaService.signedUrl");
    expect(route).toContain("Response.redirect(signedUrl, 307)");
  });

  it("downloads asynchronously and preserves the canonical message on media failure", () => {
    expect(webhookRoute).toContain("after(async () =>");
    expect(webhookRoute).toContain("processPendingForPhoneNumber");
    expect(mediaService).toContain('status: "failed", failure_kind: kind');
    expect(mediaService).toContain("conversation_media_failed");
    expect(mediaService).not.toContain("accessToken,");
    expect(legacyMigration).toContain("legacy_media_unavailable");
    expect(legacyMigration).toContain("and not (message.direction = 'outbound' and message.sender_type = 'agent')");
  });

  it("supports authorized agent upload and official Cloud API media send", () => {
    expect(conversationService).toContain("static async sendAgentMedia");
    expect(conversationService).toContain("MAX_AGENT_MEDIA_BYTES");
    expect(conversationService).toContain('admin.rpc("conversation_create_outbound_media_internal"');
    expect(provider).toContain("async uploadMedia");
    expect(provider).toContain("async sendMedia");
    expect(provider).toContain("[input.mediaType]: media");
    expect(timeline).toContain("MessageContent");
    for (const element of ["<audio", "<video", "documentLink", "Abrir no mapa"]) expect(timeline).toContain(element);
    expect(nextConfig).toContain("media-src 'self' https:");
  });
});
