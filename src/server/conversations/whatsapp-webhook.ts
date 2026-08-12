import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppIdentifier } from "@/server/conversations/model";

export type WhatsAppInboundEvent = {
  kind: "message";
  phoneNumberId: string;
  externalContactId: string;
  phoneNormalized: string | null;
  contactName: string | null;
  externalMessageId: string;
  body: string;
  contentType: "text" | "image" | "audio" | "video" | "document" | "location" | "template" | "interactive" | "unsupported";
  providerTimestamp: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type WhatsAppStatusEvent = {
  kind: "status";
  phoneNumberId: string;
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
};

export type WhatsAppWebhookEvent = WhatsAppInboundEvent | WhatsAppStatusEvent;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function timestamp(value: unknown) {
  const raw = text(value);
  if (!raw || !/^\d{1,16}$/.test(raw)) return null;
  const milliseconds = Number(raw) * 1000;
  const date = new Date(milliseconds);
  return Number.isFinite(milliseconds) && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function extractBody(message: UnknownRecord, type: string) {
  if (type === "text") return text(record(message.text)?.body) ?? "";
  if (type === "interactive") {
    const interactive = record(message.interactive);
    const buttonReply = record(interactive?.button_reply);
    const listReply = record(interactive?.list_reply);
    return text(buttonReply?.title) ?? text(listReply?.title) ?? "[interativo]";
  }
  if (type === "location") {
    const location = record(message.location);
    const name = text(location?.name);
    return name ? `[localização] ${name}` : "[localização]";
  }
  return `[${type || "mensagem"}]`;
}

function normalizeContentType(value: string | null): WhatsAppInboundEvent["contentType"] {
  if (value === "text" || value === "image" || value === "audio" || value === "video" || value === "document" || value === "location" || value === "template" || value === "interactive") return value;
  return "unsupported";
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppWebhookEvent[] {
  const root = record(payload);
  if (!root) return [];
  const events: WhatsAppWebhookEvent[] = [];

  for (const entryValue of array(root.entry)) {
    const entry = record(entryValue);
    if (!entry) continue;
    for (const changeValue of array(entry.changes)) {
      const change = record(changeValue);
      const value = record(change?.value);
      const metadata = record(value?.metadata);
      const phoneNumberId = text(metadata?.phone_number_id);
      if (!value || !phoneNumberId) continue;

      const contactNames = new Map<string, string>();
      for (const contactValue of array(value.contacts)) {
        const contact = record(contactValue);
        const waId = text(contact?.wa_id);
        const name = text(record(contact?.profile)?.name);
        if (waId && name) contactNames.set(waId, name);
      }

      for (const messageValue of array(value.messages)) {
        const message = record(messageValue);
        if (!message) continue;
        const externalMessageId = text(message.id);
        const from = text(message.from);
        if (!externalMessageId || !from) continue;
        const rawType = text(message.type) ?? "unsupported";
        const contentType = normalizeContentType(rawType);
        events.push({
          kind: "message",
          phoneNumberId,
          externalContactId: from,
          phoneNormalized: normalizeWhatsAppIdentifier(from),
          contactName: contactNames.get(from) ?? null,
          externalMessageId,
          body: extractBody(message, rawType).slice(0, 16000),
          contentType,
          providerTimestamp: timestamp(message.timestamp),
          metadata: { whatsapp_type: rawType },
        });
      }

      for (const statusValue of array(value.statuses)) {
        const statusRow = record(statusValue);
        if (!statusRow) continue;
        const externalMessageId = text(statusRow.id);
        const rawStatus = text(statusRow.status);
        if (!externalMessageId || !rawStatus || !["sent", "delivered", "read", "failed"].includes(rawStatus)) continue;
        const firstError = record(array(statusRow.errors)[0]);
        events.push({
          kind: "status",
          phoneNumberId,
          externalMessageId,
          status: rawStatus as WhatsAppStatusEvent["status"],
          errorCode: firstError?.code === undefined ? null : String(firstError.code),
          errorMessage: text(firstError?.title) ?? text(firstError?.message),
        });
      }
    }
  }

  return events;
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const providedHex = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  const provided = Buffer.from(providedHex, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function webhookPhoneNumberIds(events: readonly WhatsAppWebhookEvent[]) {
  return [...new Set(events.map((event) => event.phoneNumberId))];
}
