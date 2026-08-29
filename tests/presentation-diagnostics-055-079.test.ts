import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { modulesForCommercialProfile, validateModuleCatalog } from "@/modules/module-catalog";
import { moduleKeyForPathname } from "@/modules/module-routing";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("[PA-DIAG-055..066] super admin, financeiro e auditoria", () => {
  const admin = read("src/server/platform/platform-admin-service.ts");
  const billing = read("src/server/platform/platform-commercial-billing-service.ts");
  const billingPage = read("src/app/platform/assinaturas/page.tsx");
  const migration = read("supabase/sql/119_subscription_commercial_terms.sql");
  const platformPage = read("src/app/platform/page.tsx");
  const search = read("src/app/platform/organization-search.tsx");
  const restaurant = read("src/server/platform/platform-restaurant-360-service.ts");
  const support = read("src/server/platform/platform-support-action-service.ts");

  it("mantém a administração e os termos comerciais restritos ao super admin", () => {
    expect(admin).toContain('requirePlatformAdmin(true)');
    expect(billing).toContain('access.role !== "super_admin"');
    expect(billing).toContain("subscription_terms_update_internal");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("lista, busca, filtra e abre a visão 360 sem carregar dados pessoais", () => {
    expect(platformPage).toContain("OrganizationSearch");
    expect(search).toContain("useDeferredValue");
    expect(search).toContain("/platform/unidades/${unit.id}");
    expect(restaurant).not.toContain("customer_phone_snapshot");
    expect(restaurant).not.toContain("customer_name_snapshot");
  });

  it("oferece ciclo comercial e termos de R$ 79,90 vitalícios sem apagar histórico", () => {
    expect(billingPage).toContain('defaultValue={subscription.agreedPriceCents === null ? "79.90"');
    expect(billingPage).toContain("Manter este valor para sempre");
    expect(migration).toContain("agreed_price_cents");
    expect(migration).toContain("price_locked");
    expect(migration).toContain("billing_due_day");
    expect(migration).toContain("payment_status");
    expect(migration).toContain("subscription_history");
    expect(migration).toContain("audit_logs");
    expect(migration).not.toMatch(/delete\s+from\s+public\.organization_subscriptions/i);
  });

  it("mantém CRUD operacional seguro por ações auditadas e sem exclusão física", () => {
    expect(support).toContain("setStoreStatus");
    expect(support).toContain("setMenuPublished");
    expect(support).toContain("setAcceptingOrders");
    expect(support).toContain("idempotency_keys");
    expect(support).toContain("audit_logs");
    expect(support).not.toMatch(/from\("stores"\)\.delete/);
  });
});

describe("[PA-DIAG-067..079] módulos, perfis e bloqueio integral", () => {
  const access = read("src/server/modules/module-access-service.ts");
  const configuration = read("src/server/modules/module-configuration-service.ts");
  const navigation = read("src/server/access/navigation-access-service.ts");
  const layout = read("src/app/(app)/layout.tsx");
  const settings = read("src/app/(app)/configuracoes/modulos/page.tsx");
  const resourceClient = read("src/app/(app)/configuracoes/modulos/resources-client.tsx");
  const support = read("src/server/platform/platform-module-support-service.ts");

  it("mantém um catálogo válido e perfis comerciais mínimos previsíveis", () => {
    expect(validateModuleCatalog()).toEqual([]);
    const basic = modulesForCommercialProfile("restaurant", "menu_basic");
    const delivery = modulesForCommercialProfile("restaurant", "delivery");
    const whatsapp = modulesForCommercialProfile("restaurant", "delivery_whatsapp");
    expect(basic).toEqual(expect.arrayContaining(["dashboard", "orders", "catalog", "customers", "settings"]));
    expect(basic).not.toContain("finance");
    expect(delivery).toEqual(expect.arrayContaining(["production", "deliveries", "driver"]));
    expect(whatsapp).toEqual(expect.arrayContaining(["deliveries", "conversations"]));
  });

  it("remove módulos desligados da navegação e bloqueia URL direta no servidor", () => {
    expect(navigation).toContain("moduleSnapshot.availability[item.key].available");
    expect(layout).toContain("moduleKeyForPathname(pathname)");
    expect(layout).toContain("/recurso-indisponivel?module=");
    expect(moduleKeyForPathname("/financeiro")).toBe("finance");
    expect(moduleKeyForPathname("/configuracoes/conversas")).toBe("conversations");
  });

  it("valida plano, dependências, incompatibilidades e operações em andamento", () => {
    expect(configuration).toContain("operationalBlockers");
    expect(configuration).toContain("modulesBlockedByPlan");
    expect(configuration).toContain("planModuleChange");
    expect(configuration).toContain("module configuration revision conflict");
    expect(support).toContain("planned_changes");
  });

  it("oferece perfis rápidos, prévia em lote e personalização inline sem apagar dados", () => {
    expect(settings).toContain("Cardápio básico");
    expect(settings).toContain("Delivery + WhatsApp");
    expect(settings).toContain("previewCommercialProfile");
    expect(settings).toContain("Confira as mudanças e confirme quando estiver tudo certo.");
    expect(settings).toContain("desativar um recurso não apaga o histórico");
    expect(resourceClient).toContain("applyModuleChangeInlineAction");
    expect(resourceClient).toContain("Você permanece nesta mesma posição da página");
    expect(access).toContain("configRevision");
  });
});
