import { describe, expect, it } from "vitest";
import {
  buildPublicOrderWhatsAppFollowMessage,
  buildPublicOrderWhatsAppFollowProjection,
} from "@/server/orders/public-order-whatsapp-follow-policy";

describe("public order WhatsApp follow policy", () => {
  it("builds a deterministic customer-initiated message without order token or PII", () => {
    expect(buildPublicOrderWhatsAppFollowMessage(123)).toBe("Olá! Quero acompanhar meu pedido #123 pelo WhatsApp.");
  });

  it("offers a wa.me deeplink when the channel is ready and the Meta window is closed", () => {
    const projection = buildPublicOrderWhatsAppFollowProjection({
      displayNumber: 123,
      displayPhoneNumber: "+55 (19) 99999-0000",
      connectionReady: true,
      windowStatus: "closed",
      windowExpiresAt: "2026-09-22T12:00:00.000Z",
    });

    expect(projection.available).toBe(true);
    expect(projection.requiresCustomerSend).toBe(true);
    expect(projection.href).toBe(`https://wa.me/5519999990000?text=${encodeURIComponent("Olá! Quero acompanhar meu pedido #123 pelo WhatsApp.")}`);
    expect(projection.href).not.toContain("token");
  });

  it("does not ask for a redundant message when the customer service window is open", () => {
    const projection = buildPublicOrderWhatsAppFollowProjection({
      displayNumber: 987,
      displayPhoneNumber: "5519999990000",
      connectionReady: true,
      windowStatus: "open",
      windowExpiresAt: "2026-09-24T12:00:00.000Z",
    });

    expect(projection.available).toBe(true);
    expect(projection.href).toBeNull();
    expect(projection.requiresCustomerSend).toBe(false);
  });

  it("offers the deeplink when the window is unknown because only a real inbound may open it", () => {
    const projection = buildPublicOrderWhatsAppFollowProjection({
      displayNumber: 42,
      displayPhoneNumber: "5519999990000",
      connectionReady: true,
      windowStatus: "unknown",
      windowExpiresAt: null,
    });

    expect(projection.available).toBe(true);
    expect(projection.requiresCustomerSend).toBe(true);
    expect(projection.href).toContain("https://wa.me/5519999990000");
  });

  it("hides the CTA when the channel is disconnected or the public number is invalid", () => {
    expect(buildPublicOrderWhatsAppFollowProjection({
      displayNumber: 10,
      displayPhoneNumber: "5519999990000",
      connectionReady: false,
      windowStatus: "closed",
      windowExpiresAt: null,
    }).available).toBe(false);

    expect(buildPublicOrderWhatsAppFollowProjection({
      displayNumber: 10,
      displayPhoneNumber: "--",
      connectionReady: true,
      windowStatus: "closed",
      windowExpiresAt: null,
    }).available).toBe(false);
  });
});
