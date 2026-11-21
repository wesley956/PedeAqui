import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { UnifiedIntelligenceRouterShadow } from "@/server/intelligence/unified-router-shadow";
import { buildIntelligenceShadowObservation } from "@/server/intelligence/shadow-observability";

const organizationId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const messageId = "44444444-4444-4444-8444-444444444444";

async function prepare(contentType: string, mode = "bot", body = "seria no pix") {
  const session = Object.freeze({ state: "active", step: "order_payment", context: Object.freeze({ channel: "whatsapp_order", cartToken: "technical-cart" }) });
  const rows: Record<string, unknown> = {
    conversations: { id: conversationId, organization_id: organizationId, store_id: storeId, contact_id: "55555555-5555-4555-8555-555555555555", channel: "whatsapp", status: mode },
    contacts: { customer_id: null },
    messages: { body, content_type: contentType },
    automation_sessions: session,
    store_conversation_settings: { intelligence_shadow_mode: true },
    stores: { business_type: "restaurant" },
  };
  const selects: Record<string, string> = {};
  const filters: Record<string, unknown[]> = {};
  const rpc = vi.fn();
  mocks.admin.mockReturnValue({ rpc, from: (table: string) => {
    const query = {
      select: (columns: string) => { selects[table] = columns; return query; },
      eq: (column: string, value: unknown) => { (filters[table] ??= []).push([column, value]); return query; },
      maybeSingle: async () => ({ data: rows[table], error: null }),
    };
    return query;
  } });
  const before = JSON.stringify(session);
  const result = await UnifiedIntelligenceRouterShadow.afterInbound({ conversation_id: conversationId, message_id: messageId, message_created: true }, "technical-media");
  expect(JSON.stringify(session)).toBe(before);
  expect(rpc).not.toHaveBeenCalled();
  expect(filters.messages).toEqual(expect.arrayContaining([["organization_id", organizationId], ["store_id", storeId], ["conversation_id", conversationId], ["id", messageId]]));
  return result!;
}

describe("shadow media boundary with an active checkout", () => {
  it.each(["audio", "image", "video", "document", "location", "unsupported", "template"])("does not interpret %s as a commercial reply, even with a text-like caption", async contentType => {
    const preparation = await prepare(contentType);
    expect(preparation.decision).toMatchObject({ intent: "unknown", tool: "fallback", wouldHandle: false, authorityOperation: null, handoffReason: "low_confidence" });
    const observation = buildIntelligenceShadowObservation(preparation, {
      legacyHandler: "greeting", legacyDecision: { intent: "unknown", tool: "fallback" }, legacyOutcome: "escalated_no_reply", legacyDurationMs: 1,
    });
    expect(observation.critical_mismatch).toBe(false);
    expect(observation.divergence_codes).toEqual([]);
  });

  it("replays the sanitized audio placeholder from the observed divergence", async () => {
    expect((await prepare("audio", "bot", "[audio]")).decision?.wouldHandle).toBe(false);
  });

  it.each(["human", "waiting_agent"])("preserves %s lock ahead of the media fallback", async mode => {
    expect((await prepare("audio", mode)).decision).toMatchObject({ intent: "handoff", tool: null, wouldHandle: false, handoffReason: "human_lock" });
  });

  it.each(["text", "interactive"])("retains canonical Pix checkout routing for %s", async contentType => {
    expect((await prepare(contentType)).decision).toMatchObject({ intent: "order_continue", tool: "whatsapp_order", wouldHandle: true });
  });
});
