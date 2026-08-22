import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendWhatsAppBotMenu,
  buildOrderLookupMessage,
  buildWhatsAppBotMenu,
  phonesBelongToSameCustomer,
  resolveWhatsAppBotIntent,
  trackingCodeFromInput,
} from "@/server/conversations/bot-menu";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("[PA-DIAG-046..049] menu e acompanhamento do WhatsApp", () => {
  it("apresenta as três opções comerciais sem esconder o nome da loja", () => {
    const initial = appendWhatsAppBotMenu("Olá! Bem-vindo à Loja Centro. Cardápio: https://app.test/m/centro");
    const menu = buildWhatsAppBotMenu("Loja Centro");
    for (const text of [initial, menu]) {
      expect(text).toContain("1 — Ver cardápio");
      expect(text).toContain("2 — Acompanhar pedido");
      expect(text).toContain("3 — Falar com o restaurante");
    }
    expect(menu).toContain("Loja Centro");
  });

  it("interpreta números e linguagem natural sem confundir o código após a pergunta", () => {
    expect(resolveWhatsAppBotIntent("1", "menu")).toBe("menu_link");
    expect(resolveWhatsAppBotIntent("Acompanhar pedido", "menu")).toBe("track_start");
    expect(resolveWhatsAppBotIntent("3", "menu")).toBe("handoff");
    expect(resolveWhatsAppBotIntent("#42", "awaiting_tracking_code")).toBe("track_code");
    expect(resolveWhatsAppBotIntent("1", "awaiting_tracking_code")).toBe("track_code");
    expect(trackingCodeFromInput("Pedido #0042")).toBe(42);
    expect(trackingCodeFromInput("abc-42")).toBeNull();
  });

  it("exige telefone equivalente além do código e aceita o prefixo brasileiro da Meta", () => {
    expect(phonesBelongToSameCustomer("5511999998888", "11999998888")).toBe(true);
    expect(phonesBelongToSameCustomer("5511999998888", "21999998888")).toBe(false);
    expect(phonesBelongToSameCustomer(null, "11999998888")).toBe(false);
  });

  it("devolve situação útil e link seguro quando o contexto existe", () => {
    const message = buildOrderLookupMessage({
      displayNumber: 42,
      orderStatus: "confirmed",
      productionStatus: "preparing",
      fulfillmentStatus: "pending",
      trackingUrl: "https://app.test/m/centro/pedido/id/acesso?t=segredo",
    });
    expect(message).toContain("Pedido #42: confirmado");
    expect(message).toContain("Preparo: em preparo");
    expect(message).toContain("Acompanhe os detalhes com segurança");
  });
});

describe("[PA-DIAG-050..054] contratos de segurança e operação", () => {
  const service = read("src/server/conversations/greeting-service.ts");
  const route = read("src/app/api/webhooks/whatsapp/route.ts");
  const notifications = read("src/server/conversations/order-notification-worker.ts");
  const health = read("src/server/platform/platform-integration-health-service.ts");

  it("ignora reentrega do mesmo evento e gera uma chave por mensagem recebida", () => {
    expect(service).toContain("ingest.message_created === false");
    expect(service).toContain("auto:menu:${ingest.message_id}");
    expect(service).toContain("conversation_claim_bot_outbound_internal");
  });

  it("mantém sessão curta no banco e escopo de pedido por organização e unidade", () => {
    expect(service).toContain("automation_session_upsert_internal");
    expect(service).toContain("30 * 60 * 1000");
    expect(service).toContain('.eq("organization_id", conversation.organization_id)');
    expect(service).toContain('.eq("store_id", conversation.store_id)');
    expect(service).toContain("phonesBelongToSameCustomer");
  });

  it("transfere para humano antes de qualquer nova automação", () => {
    expect(service).toContain('p_target_state: "waiting_agent"');
    expect(service).toContain("Cliente solicitou atendimento humano pelo menu do WhatsApp");
    expect(service).toContain('conversation.status !== "bot"');
  });

  it("mantém notificações transacionais e diagnóstico de conexão fora do webhook crítico", () => {
    expect(route).toContain("ConversationGreetingService.afterInbound");
    expect(route).toContain('recordFailure("whatsapp.greeting.failed"');
    expect(notifications).toContain("notificationClientMessageId");
    expect(notifications).toContain("provider.sendTemplate");
    expect(health).toContain("waState");
    expect(health).toContain("whatsapp_enabled");
    expect(service).toContain("WhatsApp sem conexão pronta para resposta automática");
    expect(service).toContain("Falha no envio automático pelo provedor do WhatsApp");
  });
});
