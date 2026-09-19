import { describe, expect, it } from "vitest";
import {
  resolveBotResumeSession,
  resumeCartToken,
} from "@/server/conversations/conversation-bot-resume-policy";

const now = Date.parse("2026-09-19T12:00:00.000Z");

function orderSession(overrides: Partial<{
  state: string;
  step: string;
  context: unknown;
  expiresAt: string | null;
}> = {}) {
  return {
    state: "active",
    step: "order_payment",
    context: { channel: "whatsapp_order", version: 1, cartToken: "cart-token" },
    expiresAt: "2026-09-19T13:00:00.000Z",
    ...overrides,
  };
}

describe("FLOW-08 bot resume handoff policy", () => {
  it("preserves the exact order step when the session and cart are still valid", () => {
    expect(resolveBotResumeSession({ session: orderSession(), nowMs: now, cartActive: true }))
      .toEqual({ mode: "preserve", reason: "preserve_order_step" });
  });

  it("recovers safely instead of resuming an expired session", () => {
    expect(resolveBotResumeSession({
      session: orderSession({ expiresAt: "2026-09-19T11:59:59.000Z" }),
      nowMs: now,
      cartActive: true,
    })).toEqual({ mode: "safe_menu", reason: "session_expired" });
  });

  it("recovers safely when an order step lost its canonical cart token", () => {
    expect(resolveBotResumeSession({
      session: orderSession({ context: { channel: "whatsapp_order", version: 1 } }),
      nowMs: now,
      cartActive: null,
    })).toEqual({ mode: "safe_menu", reason: "order_context_missing" });
  });

  it("recovers safely when the referenced cart is no longer active", () => {
    expect(resolveBotResumeSession({ session: orderSession(), nowMs: now, cartActive: false }))
      .toEqual({ mode: "safe_menu", reason: "cart_inactive" });
  });

  it("never resumes checkout confirmation when the same cart already became an order", () => {
    expect(resolveBotResumeSession({
      session: orderSession({ step: "order_confirmation" }),
      nowMs: now,
      cartActive: false,
      cartConvertedToOrder: true,
    })).toEqual({ mode: "safe_menu", reason: "cart_already_converted" });
  });

  it("gives an existing order precedence over a stale active-cart observation", () => {
    expect(resolveBotResumeSession({
      session: orderSession({ step: "order_confirmation" }),
      nowMs: now,
      cartActive: true,
      cartConvertedToOrder: true,
    })).toEqual({ mode: "safe_menu", reason: "cart_already_converted" });
  });

  it("preserves active non-order state without inventing a checkout", () => {
    expect(resolveBotResumeSession({
      session: orderSession({ step: "awaiting_tracking_code", context: { channel: "whatsapp_menu", version: 3 } }),
      nowMs: now,
      cartActive: null,
    })).toEqual({ mode: "preserve", reason: "preserve_non_order_step" });
  });

  it("uses safe menu recovery when there is no resumable session", () => {
    expect(resolveBotResumeSession({ session: null, nowMs: now, cartActive: null }))
      .toEqual({ mode: "safe_menu", reason: "no_session" });
    expect(resolveBotResumeSession({
      session: orderSession({ state: "expired" }),
      nowMs: now,
      cartActive: true,
    })).toEqual({ mode: "safe_menu", reason: "session_inactive" });
  });

  it("only extracts cart tokens from the canonical WhatsApp order context", () => {
    expect(resumeCartToken({ channel: "whatsapp_order", cartToken: " abc " })).toBe("abc");
    expect(resumeCartToken({ channel: "whatsapp_menu", cartToken: "abc" })).toBeNull();
    expect(resumeCartToken({ channel: "whatsapp_order", cartToken: "" })).toBeNull();
  });

  it("is deterministic for simultaneous duplicate resume evaluations", () => {
    const input = { session: orderSession(), nowMs: now, cartActive: true, cartConvertedToOrder: false };
    expect(resolveBotResumeSession(input)).toEqual(resolveBotResumeSession(input));
  });
});
