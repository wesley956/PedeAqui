import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  META_CUSTOMER_SERVICE_WINDOW_MS,
  renderWhatsAppTemplateBody,
  resolveWhatsAppSendWindow,
  templateBodyParameterCount,
} from "@/server/conversations/whatsapp-send-policy";

const read = (path: string) => readFileSync(path, "utf8");
const service = read("src/server/conversations/conversation-service.ts");
const provider = read("src/server/conversations/provider.ts");
const page = read("src/app/(app)/conversas/page.tsx");
const actions = read("src/features/conversations/actions.ts");
const migration = read("supabase/migrations/20260917233400_wpp11_conversation_template_send.sql");

describe("WPP-11 Meta service window and manual templates", () => {
  it("opens only before the exact 24 hour boundary", () => {
    expect(META_CUSTOMER_SERVICE_WINDOW_MS).toBe(86_400_000);
    const inbound = "2026-09-16T12:00:00.000Z";

    expect(resolveWhatsAppSendWindow(inbound, new Date("2026-09-17T11:59:59.999Z"))).toMatchObject({
      status: "open",
      canSendFreeform: true,
      expiresAt: "2026-09-17T12:00:00.000Z",
    });
    expect(resolveWhatsAppSendWindow(inbound, new Date("2026-09-17T12:00:00.000Z"))).toMatchObject({
      status: "closed",
      canSendFreeform: false,
    });
    expect(resolveWhatsAppSendWindow(null)).toMatchObject({
      status: "unknown",
      canSendFreeform: false,
    });
  });

  it("renders only explicit numbered body parameters", () => {
    const body = "Olá {{1}}, seu pedido {{2}} está pronto.";
    expect(templateBodyParameterCount(body)).toBe(2);
    expect(renderWhatsAppTemplateBody(body, ["Maria", "#123"])).toBe("Olá Maria, seu pedido #123 está pronto.");
  });

  it("derives the freeform window from tenant-scoped customer inbound messages", () => {
    for (const fragment of [
      '.eq("organization_id", organizationId)',
      '.eq("store_id", storeId)',
      '.eq("conversation_id", conversationId)',
      '.eq("direction", "inbound")',
      '.eq("sender_type", "contact")',
      "resolveWhatsAppSendWindow(lastInboundAt)",
      "assertFreeformAllowed(sendContext)",
    ]) {
      expect(service).toContain(fragment);
    }
    expect(service).toContain("provider_timestamp ?? row.created_at");
    expect(service).not.toContain("resolveWhatsAppSendWindow(conversation.last_message_at");
  });

  it("blocks freeform before provider sends and revalidates template server-side", () => {
    const textMethod = service.slice(service.indexOf("static async sendAgentText"), service.indexOf("static async sendAgentMedia"));
    expect(textMethod.indexOf("assertFreeformAllowed(sendContext)")).toBeLessThan(textMethod.indexOf("conversation_create_outbound_internal"));
    expect(textMethod.indexOf("assertFreeformAllowed(sendContext)")).toBeLessThan(textMethod.indexOf("provider.sendText"));

    const mediaMethod = service.slice(service.indexOf("static async sendAgentMedia"), service.indexOf("static async sendAgentTemplate"));
    expect(mediaMethod.indexOf("assertFreeformAllowed(sendContext)")).toBeLessThan(mediaMethod.indexOf("CONVERSATION_MEDIA_BUCKET"));
    expect(mediaMethod.indexOf("assertFreeformAllowed(sendContext)")).toBeLessThan(mediaMethod.indexOf("provider.uploadMedia"));

    const templateMethod = service.slice(service.indexOf("static async sendAgentTemplate"), service.indexOf("static async resolveWebhookAppSecret"));
    expect(templateMethod).toContain("includeTemplates: true");
    expect(templateMethod).toContain("item.name === values.templateName");
    expect(templateMethod).toContain("item.language === values.languageCode");
    expect(templateMethod).toContain("values.bodyParameters.length !== template.bodyParameterCount");
  });

  it("reads only approved templates from the configured WABA", () => {
    expect(provider).toContain("/message_templates");
    expect(provider).toContain('url.searchParams.set("fields", "name,language,status,category,components")');
    expect(provider).toContain('template.status !== "APPROVED"');
    expect(provider).toContain("supported: !unsupportedDynamicComponent");
    expect(service).toContain("whatsapp_business_account_id");
    expect(service).toContain("provider.listTemplates(normalizedSettings.businessAccountId)");
    expect(service).toContain("input.includeTemplates && !window.canSendFreeform");
  });

  it("persists templates canonically with least-privilege RPC access", () => {
    expect(migration).toContain("conversation_create_outbound_template_internal");
    expect(migration).toContain("'outbound', 'agent', p_actor_user_id, 'template'");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("on conflict (organization_id, client_message_id)");
    expect(migration).toContain("template send requires whatsapp channel");
  });

  it("projects Meta window state and never falls back to freeform outside the window", () => {
    expect(page).toContain("Janela Meta aberta");
    expect(page).toContain("Template necessário");
    expect(page).toContain("detail.sendCapability.canSendFreeform");
    expect(page).toContain("detail.sendCapability.templates");
    expect(page).toContain("sendConversationTemplateAction");
    expect(actions).toContain("ConversationSendPolicyError");
    expect(service).toContain('error.retryable ? "provider_retryable" : "provider_non_retryable"');
    expect(page).toContain("A Meta está temporariamente indisponível.");
    expect(page).toContain("A Meta rejeitou o envio.");
    expect(actions).toContain("sendAgentTemplate");
    expect(actions).not.toContain('sendConversationTemplateAction(formData: FormData) {\n  const id = conversationId(formData);\n  try {\n    await ConversationService.sendAgentText');
  });
});
