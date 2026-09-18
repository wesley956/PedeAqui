import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const service = read("src/server/platform/platform-whatsapp-order-template-service.ts");
const page = read("src/app/platform/unidades/[storeId]/whatsapp/notificacoes/page.tsx");
const actions = read("src/app/platform/unidades/[storeId]/whatsapp/notificacoes/actions.ts");

describe("platform WhatsApp order template", () => {
  it("creates the transactional template through a commercial WABA using the permanent server token", () => {
    expect(service).toContain('const TEMPLATE_NAME = "pedeaqui_atualizacao_pedido"');
    expect(service).toContain('const TEMPLATE_CATEGORY = "UTILITY"');
    expect(service).toContain('resolveWhatsAppAccessToken("META_SYSTEM_USER_ACCESS_TOKEN")');
    expect(service).toContain("/message_templates");
    expect(service).toContain('method: "POST"');
  });

  it("keeps the four body parameters in the same order used by the order notification worker", () => {
    const body = "Olá! A {{1}} informa que o pedido {{2}} teve uma atualização: {{3}}. Acompanhe pelo link {{4}}. Obrigado por pedir conosco.";
    expect(service).toContain(body);
    expect(body.trim()).not.toMatch(/^\{\{\d+\}\}/);
    expect(body.trim()).not.toMatch(/\{\{\d+\}\}$/);
    expect(service).toContain('"Restaurante PedeAqui"');
    expect(service).toContain('"#123"');
    expect(service).toContain('"Saiu para entrega"');
  });

  it("logs only sanitized Meta rejection metadata", () => {
    expect(service).toContain('msg: "meta_order_template_request_rejected"');
    expect(service).toContain("providerCode: payload?.error?.code ?? null");
    expect(service).toContain("providerSubcode: payload?.error?.error_subcode ?? null");
    expect(service).toContain("providerType: payload?.error?.type ?? null");
    expect(service).not.toContain("message: payload?.error?.message");
  });

  it("uses a safe 24h-only mode for Meta Test WhatsApp Business Accounts without changing the restaurant flow", () => {
    expect(service).toContain('const TEST_WINDOW_ONLY = "TEST_WINDOW_ONLY"');
    expect(service).toContain("test whatsapp business account");
    expect(service).toContain("persistTestWindowMode");
    expect(service).toContain("order_notification_template_name: null");
    expect(service).toContain("restaurant_flow_preserved: true");
    expect(service).not.toContain("order_notifications_enabled: true");
    expect(page).toContain("Modo de homologação ativo");
    expect(page).toContain("Ativas por 24h");
  });

  it("stores an approved Meta template without forcing notification choices", () => {
    expect(service).toContain('const APPROVED = "APPROVED"');
    expect(service).toContain("status === APPROVED ? TEMPLATE_NAME : null");
    expect(service).toContain("restaurant_flow_preserved: true");
    expect(service).not.toContain("order_notifications_enabled: approved");
    expect(service).not.toContain("notify_order_received: true");
    expect(service).not.toContain("notify_payment_paid: true");
    expect(service).not.toContain("notify_pickup_ready: true");
    expect(service).not.toContain("notify_out_for_delivery: true");
    expect(service).not.toContain("notify_delivered: true");
  });

  it("exposes only a server action and never asks the browser for Meta credentials", () => {
    expect(actions).toContain("PlatformWhatsAppOrderTemplateService.ensure");
    expect(page).toContain("Criar template na Meta");
    expect(page).not.toContain('name="accessToken"');
    expect(page).not.toContain('name="appSecret"');
  });
});
