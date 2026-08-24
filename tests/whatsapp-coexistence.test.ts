import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook, webhookPhoneNumberIds } from "@/server/conversations/whatsapp-webhook";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("WhatsApp Business App coexistence", () => {
  it("parses messages sent from the Business App as outbound echo events", () => {
    const events = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "smb_message_echoes",
          value: {
            metadata: { phone_number_id: "123456789012345" },
            message_echoes: [{
              id: "wamid.echo-1",
              to: "5511999999999",
              type: "text",
              timestamp: "1720000000",
              text: { body: "Resposta enviada pelo celular" },
            }],
          },
        }],
      }],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "echo",
      phoneNumberId: "123456789012345",
      externalContactId: "5511999999999",
      externalMessageId: "wamid.echo-1",
      body: "Resposta enviada pelo celular",
      contentType: "text",
      metadata: { whatsapp_type: "text", source: "whatsapp_business_app" },
    });
    expect(webhookPhoneNumberIds(events)).toEqual(["123456789012345"]);
  });

  it("recognizes history and app-state sync without turning them into customer inbound messages", () => {
    const history = parseWhatsAppWebhook({
      entry: [{ changes: [{ field: "history", value: {
        metadata: { phone_number_id: "123456789012345" },
        history: [{ id: "old-1" }, { id: "old-2" }],
      } }] }],
    });
    const stateSync = parseWhatsAppWebhook({
      entry: [{ changes: [{ field: "smb_app_state_sync", value: {
        metadata: { phone_number_id: "123456789012345" },
        state_sync: [{ type: "contact" }],
      } }] }],
    });

    expect(history).toEqual([{ kind: "sync", phoneNumberId: "123456789012345", syncType: "history", itemCount: 2 }]);
    expect(stateSync).toEqual([{ kind: "sync", phoneNumberId: "123456789012345", syncType: "smb_app_state_sync", itemCount: 1 }]);
    expect(history.some((event) => event.kind === "message")).toBe(false);
    expect(stateSync.some((event) => event.kind === "message")).toBe(false);
  });

  it("keeps coexistence echo ingestion service-role only and idempotent", () => {
    const migration = read("supabase/sql/142_whatsapp_coexistence_echo_ingestion.sql");
    const service = read("src/server/conversations/coexistence-service.ts");

    expect(migration).toContain("conversation_receive_echo_internal");
    expect(migration).toContain("on conflict (store_id, provider, external_message_id)");
    expect(migration).toContain("revoke all on function public.conversation_receive_echo_internal");
    expect(migration).toContain("grant execute on function public.conversation_receive_echo_internal");
    expect(migration).toContain("to service_role");
    expect(service).toContain('settings.connection_mode !== "coexistence"');
    expect(service).toContain('admin.rpc("conversation_receive_echo_internal"');
  });
});
