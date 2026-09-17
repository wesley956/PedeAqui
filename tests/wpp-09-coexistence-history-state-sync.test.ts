import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook } from "../src/server/conversations/whatsapp-webhook";

const migration = readFileSync("supabase/migrations/20260917220000_wpp09_coexistence_history_state_sync.sql", "utf8");
const service = readFileSync("src/server/conversations/coexistence-service.ts", "utf8");
const route = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");

function baseChange(field: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field,
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: "phone-1", display_phone_number: "5511999999999" },
          ...value,
        },
      }],
    }],
  };
}

describe("WPP-09 coexistence history/state sync", () => {
  it("normalizes history chunks without turning them into live inbound events", () => {
    const events = parseWhatsAppWebhook(baseChange("history", {
      history: [{
        metadata: { phase: 1, chunk_order: 2, progress: "75" },
        threads: [{
          id: "5511888888888",
          messages: [
            {
              from: "5511888888888",
              id: "wamid.inbound-history",
              timestamp: "1789600000",
              type: "text",
              text: { body: "mensagem antiga" },
              history_context: { status: "read" },
            },
            {
              from: "5511999999999",
              to: "5511888888888",
              id: "wamid.outbound-history",
              timestamp: "1789600060",
              type: "text",
              text: { body: "resposta antiga" },
              history_context: { status: "delivered" },
            },
          ],
        }],
      }],
    }));

    expect(events).toHaveLength(1);
    const sync = events[0];
    expect(sync.kind).toBe("sync");
    if (sync.kind !== "sync") throw new Error("expected sync");
    expect(sync.syncType).toBe("history");
    expect(sync.phase).toBe("1");
    expect(sync.chunkOrder).toBe(2);
    expect(sync.progress).toBe("75");
    expect(sync.historyMessages).toHaveLength(2);
    expect(sync.historyMessages[0]).toMatchObject({
      externalContactId: "5511888888888",
      direction: "inbound",
      deliveryStatus: "received",
      externalMessageId: "wamid.inbound-history",
    });
    expect(sync.historyMessages[1]).toMatchObject({
      direction: "outbound",
      deliveryStatus: "delivered",
      externalMessageId: "wamid.outbound-history",
    });
    expect(sync.historyMessages[1].metadata.source).toBe("whatsapp_business_app");
    expect(events.some((event) => event.kind === "message")).toBe(false);
  });

  it("preserves a history sharing error without importing fake messages", () => {
    const events = parseWhatsAppWebhook(baseChange("history", {
      history: [{
        errors: [{ code: 2593109, title: "History sync is turned off" }],
      }],
    }));
    expect(events).toHaveLength(1);
    const sync = events[0];
    if (sync.kind !== "sync") throw new Error("expected sync");
    expect(sync.syncType).toBe("history");
    expect(sync.errorCode).toBe("2593109");
    expect(sync.historyMessages).toEqual([]);
  });

  it("normalizes add/remove contact state without creating conversation events", () => {
    const events = parseWhatsAppWebhook(baseChange("smb_app_state_sync", {
      state_sync: [
        {
          type: "contact",
          action: "add",
          contact: { full_name: "Cliente Teste", phone_number: "+55 11 77777-7777" },
          metadata: { timestamp: "1789600100" },
        },
        {
          type: "contact",
          action: "remove",
          contact: { phone_number: "5511666666666" },
          metadata: { timestamp: "1789600200" },
        },
      ],
    }));
    expect(events).toHaveLength(1);
    const sync = events[0];
    if (sync.kind !== "sync") throw new Error("expected sync");
    expect(sync.syncType).toBe("smb_app_state_sync");
    expect(sync.contacts).toHaveLength(2);
    expect(sync.contacts[0]).toMatchObject({ action: "add", phoneNormalized: "5511777777777", fullName: "Cliente Teste" });
    expect(sync.contacts[1]).toMatchObject({ action: "remove", phoneNormalized: "5511666666666" });
  });

  it("keeps both sync capabilities OFF by default and service-role-only", () => {
    expect(migration).toContain("coexistence_history_sync_enabled boolean not null default false");
    expect(migration).toContain("coexistence_contact_sync_enabled boolean not null default false");
    expect(migration).toContain("conversation_import_history_internal");
    expect(migration).toContain("conversation_sync_app_contacts_internal");
    expect(migration).toContain("revoke all on function public.conversation_import_history_internal");
    expect(migration).toContain("revoke all on function public.conversation_sync_app_contacts_internal");
    expect(migration).toContain("to service_role");
  });

  it("imports canonical history idempotently without unread or live-message side effects", () => {
    expect(migration).toContain("on conflict (store_id, provider, external_message_id)");
    expect(migration).toContain("'sync_source', 'history'");
    expect(migration).toContain("'historical', true");
    expect(migration).toContain("'whatsapp_business_app'");
    expect(migration).toContain("'bot', 0");
    expect(migration).not.toContain("unread_count = unread_count + 1");
    expect(migration).not.toContain("conversation.message_received");
    expect(migration).not.toContain("conversation_receive_message_internal");
    expect(migration).not.toContain("conversation_receive_echo_internal");
  });

  it("keeps history-only seeds out of auto-close until a live message exists", () => {
    expect(migration).toContain("coalesce(live.metadata ->> 'sync_source', '') <> 'history'");
    expect(migration).toContain("'reason', 'history_only'");
  });

  it("syncs app contacts without inventing customers or deleting message history", () => {
    expect(migration).toContain("coexistence_contact_present");
    expect(migration).toContain("v_action = 'remove'");
    expect(migration).not.toMatch(/insert\s+into\s+public\.customers/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.contacts/i);
  });

  it("keeps sync events out of live greeting/order/intelligence flow", () => {
    expect(service).toContain("conversation_import_history_internal");
    expect(service).toContain("conversation_sync_app_contacts_internal");
    expect(service).toContain("history_sync_disabled");
    expect(service).toContain("contact_sync_disabled");
    expect(service).not.toContain("ConversationGreetingService");
    expect(service).not.toContain("WhatsAppDirectOrderOrchestrator");
  });

  it("accepts signed coexistence history chunks up to three MiB and propagates request id", () => {
    expect(route).toContain("3 * 1024 * 1024");
    expect(route).toContain('Buffer.byteLength(rawBody, "utf8")');
    expect(route).toContain("WhatsAppCoexistenceService.ingest(event, requestContext.requestId)");
    expect(route).toContain("verifyMetaWebhookSignature");
  });
});
