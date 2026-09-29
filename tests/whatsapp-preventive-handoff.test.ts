import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { ConversationGreetingService } from "@/server/conversations/greeting-service";
import { WhatsAppDirectOrderOrchestrator } from "@/server/conversations/whatsapp-direct-order-orchestrator";

function query(data: unknown) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data, error: null }) };
  return q;
}
for (const handler of [ConversationGreetingService, WhatsAppDirectOrderOrchestrator]) {
  describe(`${handler.name} preventive handoff`, () => {
    for (const state of ["bot", "human", "waiting_agent"]) {
      for (const draft of [false, true]) {
        it(`blocks commercial effects in ${state}, draft=${draft}`, async () => {
          const session = draft ? { state: "active", step: "order_payment", context: { cartToken: "technical-cart" } } : null;
          const rows: Record<string, unknown> = {
            conversations: { id: "c", organization_id: "o", store_id: "s", contact_id: "ct", channel: "whatsapp", status: state },
            store_conversation_settings: { default_bot_enabled: true, whatsapp_enabled: true, whatsapp_orders_enabled: true, whatsapp_phone_number_id: "pn", access_token_secret_ref: "secret" },
            contacts: { external_id: "technical-contact" },
            stores: { name: "Technical", slug: "technical", status: "active" },
            store_menu_settings: { active: true },
            messages: { body: "vendo caixas 15x15x7: 30 unidades", content_type: "text" },
            automation_sessions: session,
          };
          const rpc = vi.fn(async () => ({ data: { status: "waiting_agent" }, error: null }));
          const from = vi.fn((table: string) => {
            if (!(table in rows)) throw new Error(`Unexpected commercial access ${table}`);
            return query(rows[table]);
          });
          mocks.admin.mockReturnValue({ from, rpc });
          const before = JSON.stringify(session);
          await handler.afterInbound({ conversation_id: "c", message_id: "m", message_created: true }, "technical");
          expect(JSON.stringify(session)).toBe(before);
          if (state === "bot") {
            expect(rpc.mock.calls).toEqual([["conversation_preventive_handoff_internal", {
              p_organization_id: "o", p_store_id: "s", p_conversation_id: "c", p_message_id: "m", p_reason_code: "supplier_contact",
            }]]);
          } else expect(rpc).not.toHaveBeenCalled();
        });
      }
    }
    it("fails closed when atomic handoff fails", async () => {
      const rows: Record<string, unknown> = {
        conversations: { id: "c", organization_id: "o", store_id: "s", channel: "whatsapp", status: "bot" },
        store_conversation_settings: { default_bot_enabled: true, whatsapp_enabled: true, whatsapp_orders_enabled: true, whatsapp_phone_number_id: "pn", access_token_secret_ref: "secret" },
        contacts: { external_id: "technical" }, stores: { name: "Technical", slug: "technical" },
        messages: { body: "vaga de freelance", content_type: "text" }, automation_sessions: null,
      };
      const error = new Error("RPC unavailable");
      const rpc = vi.fn(async () => ({ error }));
      mocks.admin.mockReturnValue({ from: (t: string) => query(rows[t]), rpc });
      await expect(handler.afterInbound({ conversation_id: "c", message_id: "m" }, "technical")).rejects.toBe(error);
      expect(rpc).toHaveBeenCalledTimes(1);
    });
  });
}
