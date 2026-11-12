import { describe, expect, it } from "vitest";
import { normalizeBotInput, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { asksStoreLocation, catalogAvailabilityQuery } from "@/server/conversations/whatsapp-service-recovery";
import { isWhatsAppNonActionableAcknowledgement } from "@/server/conversations/whatsapp-non-actionable";
import { parseWhatsAppWebhook } from "@/server/conversations/whatsapp-webhook";
import { classifyWhatsAppOperationalHealth } from "@/server/conversations/whatsapp-operational-health-model";

describe("WhatsApp recovery from real conversation patterns", () => {
  it.each([
    "Meu pedido está atrasado", "Meu pedido não chegou", "Veio errado, quero pedir de novo",
    "O site não funciona, posso pedir por aqui?", "O link travou",
    "Não sei se meu pedido foi finalizado", "Quero encomendar 50 salgados para domingo",
    "Quero fazer uma reclamação, estava azedo",
  ])("escalates without starting another order: %s", (body) => {
    expect(resolveWhatsAppBotIntent(body, "menu")).toBe("handoff");
    expect(resolveWhatsAppBotIntent(body, "awaiting_tracking_code")).toBe("handoff");
  });
  it.each([
    ["Quero pedir 20 salgados", "order_start"], ["Quanto tempo demora a entrega?", "delivery"],
    ["Onde está meu pedido?", "track_start"], ["Tem kibe assado?", "price"],
    ["Em qual cidade vocês ficam?", "location"], ["Qual o endereço?", "location"],
  ])("preserves ordinary routing: %s", (body, expected) => {
    expect(resolveWhatsAppBotIntent(body, "menu")).toBe(expected);
  });
  it.each([
    ["Olá! Quero pedir pizza cone pronta. Pode me enviar o cardápio?", "menu_link"],
    ["Quero comprar, manda o cardápio por favor", "menu_link"],
    ["Jackson aonde é o local que você está trabalhando , para retirada ?", "location"],
    ["Onde posso retirar?", "location"],
    ["Sou a Gisele do sorteio Gostaria de saber se posso retirar hj", "handoff"],
    ["Por favor me avisa quando estiver pronto, estou aqui no fundo", "handoff"],
    ["Assim já vou pro portão receber o pedido", "handoff"],
    ["Quero falar com atendente sobre meu pedido", "handoff"],
    ["O cardápio não abre, quero pedir", "handoff"],
    ["Meu pedido atrasou, manda o cardápio", "handoff"],
  ])("routes actual customer language without unrelated tracking prompts: %s", (body, expected) => {
    expect(resolveWhatsAppBotIntent(body, "menu")).toBe(expected);
    expect(resolveWhatsAppBotIntent(body, "awaiting_tracking_code")).toBe(expected);
  });
  it("does not treat a customer's delivery address as a pickup location", () => {
    expect(asksStoreLocation(normalizeBotInput("Onde está meu pedido para retirada?"))).toBe(false);
    expect(asksStoreLocation(normalizeBotInput("Qual o meu endereço de entrega?"))).toBe(false);
  });

  it.each(["Quero fazer um pedido", "Quero pedir 20 salgados", "7"])("guides ordering to the menu only when chat ordering is disabled: %s", (body) => {
    expect(resolveWhatsAppBotIntent(body, "menu", { allowWhatsAppOrders: false })).toBe("menu_link");
    expect(resolveWhatsAppBotIntent(body, "menu", { allowWhatsAppOrders: true })).toBe("order_start");
  });

  it("extracts only a bounded product availability query", () => {
    expect(catalogAvailabilityQuery(normalizeBotInput("Tem kibe assado hoje?"))).toBe("kibe assado");
    expect(catalogAvailabilityQuery("tem vaga de emprego")).toBeNull();
    expect(catalogAvailabilityQuery("tem entrega")).toBeNull();
  });
  it("keeps a saved customer address separate from store location", () => {
    expect(asksStoreLocation(normalizeBotInput("Qual endereço está salvo aí?"))).toBe(false);
    expect(asksStoreLocation(normalizeBotInput("Qual o meu endereço?"))).toBe(false);
    expect(asksStoreLocation(normalizeBotInput("Qual o endereço da loja?"))).toBe(true);
  });
  it("ignores standalone praise but keeps a question accompanying praise", () => {
    expect(isWhatsAppNonActionableAcknowledgement("Muito bom!")).toBe(true);
    expect(isWhatsAppNonActionableAcknowledgement("Muito bom, mas onde está meu pedido?")).toBe(false);
  });
  it("retains bounded referral and quoted message IDs without media URLs or raw payloads", () => {
    const events = parseWhatsAppWebhook({ entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "technical-phone" },
      messages: [{ id: "technical-message", from: "5519999990000", type: "text", text: { body: "Informações" },
        context: { id: "quoted-message", from: "private-sender" },
        referral: { source_id: "ad-123", source_type: "ad", headline: "x".repeat(500), body: "Detalhes", image_url: "https://private.invalid/image", secret: "discard" },
      }],
    } }] }] });
    const message = events[0];
    expect(message?.kind).toBe("message");
    if (!message || message.kind !== "message") throw new Error("Expected message");
    expect(message.metadata).toMatchObject({ referral_source_id: "ad-123", reply_to_external_message_id: "quoted-message" });
    expect(String(message.metadata.referral_headline)).toHaveLength(240);
    expect(JSON.stringify(message.metadata)).not.toMatch(/private|discard/);
  });
  it("flags billing failures as requiring action even while connection stays connected", () => {
    const result = classifyWhatsAppOperationalHealth({
      enabled: true, connectionStatus: "connected", onboardingStatus: "completed", connectionMode: "cloud_api",
      subscriptionStatus: null, appWebhookStatus: null, lastIngestErrorAt: null, lastIngestErrorKind: null,
      lastHistoryErrorKind: null, lastStateSyncErrorKind: null, outboundPending: 0, outboundFailedRecent: 1,
      metaBillingFailedRecent: 1, mediaPending: 0, mediaFailedRecent: 0,
    });
    expect(result.state).toBe("action_required");
    expect(result.issues).toContain("meta_billing_action_required");
  });
});
