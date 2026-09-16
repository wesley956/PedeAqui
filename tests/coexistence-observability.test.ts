import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  subscriptionNeedsAction,
  summarizeWebhookReceiptKinds,
} from "@/server/conversations/coexistence-observability-model";

describe("WPP-08 Coexistence observability", () => {
  it("tracks normal messages and smb_message_echoes independently", () => {
    expect(summarizeWebhookReceiptKinds(["message", "status"])).toEqual({ messages: true, echo: false });
    expect(summarizeWebhookReceiptKinds(["echo", "sync"])).toEqual({ messages: false, echo: true });
    expect(summarizeWebhookReceiptKinds(["message", "echo"])).toEqual({ messages: true, echo: true });
  });

  it("requires manual action only for actionable subscription states", () => {
    expect(subscriptionNeedsAction("not_subscribed")).toBe(true);
    expect(subscriptionNeedsAction("action_required")).toBe(true);
    expect(subscriptionNeedsAction("subscribed")).toBe(false);
    expect(subscriptionNeedsAction("unknown")).toBe(false);
    expect(subscriptionNeedsAction("not_supported")).toBe(false);
  });

  it("records webhook receipt only after signature verification and persistence only after the canonical RPC", () => {
    const route = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    const coexistence = readFileSync("src/server/conversations/coexistence-service.ts", "utf8");
    const signatureCheck = route.indexOf("verifyMetaWebhookSignature(rawBody");
    const receiptMarker = route.indexOf("WhatsAppCoexistenceObservability.recordWebhookReceipt(events");
    const rpcCall = coexistence.indexOf('admin.rpc("conversation_receive_echo_internal"');
    const persistedMarker = coexistence.indexOf("WhatsAppCoexistenceObservability.recordEchoPersisted");

    expect(signatureCheck).toBeGreaterThan(-1);
    expect(receiptMarker).toBeGreaterThan(signatureCheck);
    expect(rpcCall).toBeGreaterThan(-1);
    expect(persistedMarker).toBeGreaterThan(rpcCall);
  });

  it("keeps technical telemetry isolated from conversation content and client roles", () => {
    const migration = readFileSync("supabase/migrations/20260916070000_wpp08_coexistence_observability.sql", "utf8");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.whatsapp_coexistence_observability from authenticated");
    expect(migration).not.toMatch(/message_body|phone_number|access_token|address/i);
  });
});
