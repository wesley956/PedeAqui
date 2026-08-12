import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransitionConversation, deliveryRank, messagePreview, normalizeWhatsAppIdentifier } from "@/server/conversations/model";
import { parseWhatsAppWebhook, verifyMetaWebhookSignature } from "@/server/conversations/whatsapp-webhook";

describe("conversation state machine", () => {
  it("permite handoff e encerramento esperados", () => {
    expect(canTransitionConversation("bot", "waiting_agent")).toBe(true);
    expect(canTransitionConversation("waiting_agent", "human")).toBe(true);
    expect(canTransitionConversation("human", "closed")).toBe(true);
    expect(canTransitionConversation("closed", "bot")).toBe(true);
  });

  it("mantém entrega monotônica", () => {
    expect(deliveryRank("pending")).toBeLessThan(deliveryRank("sent"));
    expect(deliveryRank("sent")).toBeLessThan(deliveryRank("delivered"));
    expect(deliveryRank("delivered")).toBeLessThan(deliveryRank("read"));
  });

  it("normaliza identificadores e previews", () => {
    expect(normalizeWhatsAppIdentifier("+55 (19) 99999-0000")).toBe("5519999990000");
    expect(normalizeWhatsAppIdentifier("123")).toBeNull();
    expect(messagePreview("  oi   tudo bem  ")).toBe("oi tudo bem");
  });
});

describe("WhatsApp webhook", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-1" },
      contacts: [{ wa_id: "5519999990000", profile: { name: "Maria" } }],
      messages: [{ from: "5519999990000", id: "wamid.1", timestamp: "1760000000", type: "text", text: { body: "Quero fazer um pedido" } }],
      statuses: [{ id: "wamid.out", status: "delivered" }],
    } }] }],
  };

  it("projeta mensagem e status sem persistir payload bruto", () => {
    const events = parseWhatsAppWebhook(payload);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "message",
      phoneNumberId: "phone-1",
      externalContactId: "5519999990000",
      contactName: "Maria",
      externalMessageId: "wamid.1",
      body: "Quero fazer um pedido",
      contentType: "text",
    });
    expect(events[1]).toMatchObject({ kind: "status", externalMessageId: "wamid.out", status: "delivered" });
  });

  it("valida a assinatura HMAC do corpo exatamente recebido", () => {
    const body = JSON.stringify(payload);
    const secret = "secret-test";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyMetaWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyMetaWebhookSignature(body, "sha256=invalid", secret)).toBe(false);
  });
});
