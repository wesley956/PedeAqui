import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const service = read("src/server/platform/platform-commercial-billing-service.ts");
const actions = read("src/features/platform-commercial-billing/actions.ts");
const page = read("src/app/platform/assinaturas/page.tsx");
const overview = read("src/app/platform/page.tsx");
const layout = read("src/app/platform/layout.tsx");

describe("Platform commercial subscriptions [343]", () => {
  it("routes subscription management to a dedicated commercial workspace", () => {
    expect(layout).toContain('["Assinaturas", "/platform/assinaturas"]');
    expect(overview).toContain('href="/platform/assinaturas"');
    expect(overview).not.toContain('name="status"');
    expect(overview).not.toContain('name="planKey"');
  });

  it("uses semantic commercial actions instead of a raw status editor", () => {
    expect(page).toContain("Estender período de teste");
    expect(page).toContain("Ativar assinatura");
    expect(page).toContain("Alterar plano mantendo o ciclo atual");
    expect(page).toContain("Agendar cancelamento no fim do período");
    expect(page).toContain("Aplicar período de tolerância");
    expect(page).not.toContain('name="status"');
    expect(page).not.toContain('name="planKey"');
  });

  it("keeps mutations behind super admin and the official subscription state machine", () => {
    expect(service).toContain('access.role !== "super_admin"');
    expect(service).toContain("PlatformAdminService.applySubscription");
    expect(service).not.toMatch(/from\("organization_subscriptions"\)\.update/);
    expect(service).not.toMatch(/from\("organization_subscriptions"\)\.insert/);
  });

  it("requires reason, protocol and idempotency for commercial interventions", () => {
    expect(service).toContain("idempotencyKey");
    expect(service).toContain("reason:");
    expect(service).toContain("protocol:");
    expect(page).toContain('name="reason"');
    expect(page).toContain('name="protocol"');
    expect(page).toContain('name="idempotencyKey"');
  });

  it("shows commercial feature names without exposing feature keys", () => {
    expect(service).toContain('name: featureById.get(item.feature_id)?.name');
    expect(page).toContain("change.featureName ?? change.targetPlanName ?? change.changeType");
    expect(page).toContain("Módulo adicional: {addon.featureName}");
    expect(page).not.toContain("feature.key");
  });

  it("reads the authoritative subscription history and sanitizes billing failures", () => {
    expect(service).toContain('from("subscription_history")');
    expect(service).toContain('from("billing_webhook_receipts")');
    expect(service).toContain("sanitizeError");
    expect(service).not.toContain("payload_hash");
    expect(service).not.toContain("external_event_id");
    expect(page).toContain("Payloads, tokens e identificadores de cobrança não são exibidos");
  });

  it("keeps support read-only while allowing the owner to manage commercially", () => {
    expect(service).toContain('canManage: base.role === "super_admin"');
    expect(page).toContain('data.canManage ? "Gestão comercial" : "Consulta de suporte"');
    expect(actions).toContain('revalidatePath("/platform/assinaturas")');
  });
});
