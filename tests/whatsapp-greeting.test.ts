import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPublicMenuUrl, renderGreetingTemplate, validateGreetingFallback, validateGreetingTemplate } from "@/server/conversations/greeting";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("WhatsApp greeting template [326]", () => {
  it("accepts only controlled placeholders and system-generated links", () => {
    expect(validateGreetingTemplate("Olá {restaurante}! Peça aqui: {link}")).toBe(true);
    expect(validateGreetingTemplate("Abra https://evil.example e peça: {link}")).toBe(false);
    expect(validateGreetingTemplate("Olá {cliente}! Veja: {link}")).toBe(false);
    expect(validateGreetingTemplate("Olá, sem link do cardápio")).toBe(false);
    expect(validateGreetingFallback("Nosso cardápio está indisponível. Vou chamar a equipe.")).toBe(true);
    expect(validateGreetingFallback("Fale em https://evil.example")).toBe(false);
  });

  it("builds the menu URL from APP_URL origin and the store slug", () => {
    expect(buildPublicMenuUrl("https://pedido.exemplo.com/qualquer?x=1#hash", "Loja Centro"))
      .toBe("https://pedido.exemplo.com/m/Loja%20Centro");
    expect(() => buildPublicMenuUrl("javascript:alert(1)", "loja")).toThrow();
    expect(() => buildPublicMenuUrl("https://user:pass@pedido.exemplo.com", "loja")).toThrow();
  });

  it("renders only restaurant identity and the generated link", () => {
    const result = renderGreetingTemplate("Olá {restaurante}! Cardápio: {link}", "Restaurante Teste", "https://pedido.exemplo.com/m/teste");
    expect(result).toContain("Restaurante Teste");
    expect(result).toContain("https://pedido.exemplo.com/m/teste");
  });
});

describe("WhatsApp greeting automation contracts [326]", () => {
  const migration = read("supabase/sql/92_whatsapp_greeting.sql");
  const service = read("src/server/conversations/greeting-service.ts");
  const route = read("src/app/api/webhooks/whatsapp/route.ts");
  const settings = read("src/server/conversations/settings-service.ts");

  it("uses a deterministic idempotency key and an atomic claim before provider send", () => {
    expect(service).toContain("auto:greeting:${conversation.id}");
    expect(service).toContain("conversation_claim_bot_outbound_internal");
    expect(migration).toContain("for update");
    expect(migration).toContain("v_claimed := true");
    expect(migration).toContain("v_message.delivery_status = 'failed'");
  });

  it("never lets greeting failure invalidate an already ingested inbound message", () => {
    const ingestAt = route.indexOf("ingestWhatsAppEvent(event)");
    const greetingAt = route.indexOf("ConversationGreetingService.afterInbound");
    expect(ingestAt).toBeGreaterThan(-1);
    expect(greetingAt).toBeGreaterThan(ingestAt);
    expect(route).toContain("recordFailure(\"whatsapp.greeting.failed\"");
  });

  it("suspends automation outside bot state and falls back to human queue when menu is unavailable", () => {
    expect(service).toContain("conversation.status !== \"bot\"");
    expect(service).toContain("p_target_state: \"waiting_agent\"");
    expect(service).toContain("Cardápio indisponível para saudação automática");
    expect(service).toContain("menuSettings?.accepting_orders");
  });

  it("keeps greeting configuration scoped and blocks manually supplied URLs", () => {
    expect(settings).toContain("greetingEnabled");
    expect(settings).toContain("greetingTemplate");
    expect(settings).toContain("greetingFallbackMessage");
    expect(migration).toContain("greeting_template !~* '(https?://|www\\.)'");
    expect(migration).toContain("greeting_fallback_message !~* '(https?://|www\\.)'");
  });

  it("keeps the claim RPC service-role-only", () => {
    expect(migration).toContain("revoke all on function public.conversation_claim_bot_outbound_internal(uuid,text,text)");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.conversation_claim_bot_outbound_internal(uuid,text,text)");
    expect(migration).toContain("to service_role");
  });
});
