import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), send: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/conversations/provider", () => ({
  WhatsAppCloudProvider: class { sendText = mocks.send; },
  resolveWhatsAppAccessToken: () => "test-token", safeWhatsAppFailureMessage: () => "test-error",
}));
vi.mock("@/server/intelligence/catalog-adapter", () => ({
  IntelligenceCatalogAdapter: class { search = mocks.search; },
}));
vi.mock("@/server/growth/growth-observability", () => ({ recordGrowthOperationalEvent: vi.fn() }));
import { ConversationGreetingService } from "@/server/conversations/greeting-service";
import { InboundOutcomeService } from "@/server/conversations/inbound-outcome-service";

const calls: Array<{ table: string; filters: Array<unknown[]> }> = [];
let body = "mensagem desconhecida";
let replies: Array<{ body: string }> = [];
let status = "bot";
const rpc = vi.fn(async (name: string) => ({
  data: name === "conversation_claim_bot_outbound_internal" ? { claimed: true, message_id: "outbound" } : null,
  error: null,
}));

function query(table: string) {
  const call = { table, filters: [] as Array<unknown[]> }; calls.push(call);
  const rows: Record<string, unknown> = {
    conversations: { id: "conversation", organization_id: "organization", store_id: "store", contact_id: "contact", channel: "whatsapp", status },
    store_conversation_settings: {
      default_bot_enabled: true, whatsapp_enabled: true, whatsapp_phone_number_id: "test-phone",
      access_token_secret_ref: "test-ref", unknown_intent_message: "Não entendi", greeting_enabled: false,
      handoff_message: "A equipe vai continuar o atendimento.",
    },
    contacts: { external_id: "5519999990000", customer_id: null },
    stores: { name: "Loja teste", slug: "loja-teste", status: "active", street: "Rua Teste", number: "10", city: "Cidade Teste", state: "SP" },
    store_menu_settings: { active: true },
    messages: { id: "inbound", conversation_id: "conversation", organization_id: "organization", store_id: "store", body, content_type: "text", created_at: new Date().toISOString() },
    automation_sessions: { step: "order_payment", state: "active", expires_at: new Date(Date.now() + 60000).toISOString() },
  };
  const chain = {
    select: () => chain,
    eq: (...args: unknown[]) => { call.filters.push(["eq", ...args]); return chain; },
    neq: (...args: unknown[]) => { call.filters.push(["neq", ...args]); return chain; },
    gte: (...args: unknown[]) => { call.filters.push(["gte", ...args]); return chain; },
    order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: call.filters.some((f) => f[1] === "direction") ? null : rows[table], error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: replies, error: null }).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0; body = "mensagem desconhecida"; replies = []; status = "bot";
  vi.stubEnv("APP_URL", "https://example.invalid");
  mocks.admin.mockReturnValue({ from: query, rpc });
  mocks.send.mockResolvedValue({ externalMessageId: "test-sent" });
});
afterEach(() => vi.unstubAllEnvs());
const ingest = { conversation_id: "conversation", message_id: "inbound", message_created: true };

describe("WhatsApp recovery integration", () => {
  it("exits a recent fallback loop and scopes the history lookup to tenant/store/conversation", async () => {
    replies = [{ body: "Não entendi\n\nMenu" }];
    await ConversationGreetingService.afterInbound(ingest, "test-request");
    expect(rpc).toHaveBeenCalledWith("conversation_request_human_attention_internal", expect.objectContaining({ p_conversation_id: "conversation" }));
    const history = calls.find((c) => c.filters.some((f) => f[1] === "sender_type"));
    expect(history?.filters).toEqual(expect.arrayContaining([
      ["eq", "organization_id", "organization"], ["eq", "store_id", "store"], ["eq", "conversation_id", "conversation"],
    ]));
  });
  it("answers the configured location without replacing an active checkout session", async () => {
    body = "Qual o endereço?";
    await ConversationGreetingService.afterInbound(ingest, "test-request");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("Rua Teste, 10, Cidade Teste, SP") }));
    expect(rpc.mock.calls.some(([name]) => name === "automation_session_upsert_internal")).toBe(false);
  });
  it("leaves an existing human owner untouched", async () => {
    status = "human"; body = "Meu pedido não chegou";
    await ConversationGreetingService.afterInbound(ingest, "test-request");
    expect(rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not count a failed outbound as an answer and escalates unanswered inbound", async () => {
    const outcome = await InboundOutcomeService.finalize(ingest);
    expect(outcome).toBe("escalated_no_reply");
    expect(calls.some((c) => c.filters.some((f) => f.join(":") === "neq:delivery_status:failed"))).toBe(true);
    expect(rpc).toHaveBeenCalledWith("conversation_transition_internal", expect.objectContaining({ p_target_state: "waiting_agent" }));
  });
});
