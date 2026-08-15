import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("src/server/platform/platform-restaurant-360-service.ts");
const page = read("src/app/platform/empresas/[organizationId]/unidades/[storeId]/page.tsx");
const resolver = read("src/app/platform/unidades/[storeId]/page.tsx");
const search = read("src/app/platform/organization-search.tsx");

describe("Restaurant 360 support view [338]", () => {
  it("gates privileged reads before creating the admin client", () => {
    expect(service.indexOf("await PlatformAdminService.access()")).toBeGreaterThan(-1);
    expect(service.indexOf("createAdminClient()")).toBeGreaterThan(service.indexOf("await PlatformAdminService.access()"));
    expect(resolver.indexOf("await PlatformAdminService.access()")).toBeGreaterThan(-1);
    expect(resolver.indexOf("createAdminClient()")).toBeGreaterThan(resolver.indexOf("await PlatformAdminService.access()"));
  });

  it("diagnoses the main commercial readiness gates", () => {
    for (const key of ["store", "menu", "orders", "products", "hours", "fulfillment", "delivery", "payments", "whatsapp", "printing"]) {
      expect(service).toContain(`key: "${key}"`);
    }
    expect(service).not.toContain("Bloqueando vendas");
    expect(page).toContain("Prontidão comercial");
    expect(page).toContain("Bloqueando vendas");
  });

  it("uses the existing authoritative configuration tables", () => {
    for (const table of ["store_menu_settings", "store_hours", "products", "store_delivery_settings", "delivery_neighborhoods", "store_payment_methods", "store_conversation_settings", "print_agents", "printers", "orders", "organization_members", "invitations"]) {
      expect(service).toContain(`from("${table}")`);
    }
  });

  it("does not load customer PII or order snapshots into the global support view", () => {
    for (const forbidden of ["customer_name_snapshot", "customer_phone_snapshot", "customer_email_snapshot", "address_street_snapshot", "address_number_snapshot", "body,external_message_id", "access_token_secret_ref", "app_secret_secret_ref"]) {
      expect(service).not.toContain(forbidden);
    }
    expect(page).toContain("sem nome, telefone, endereço ou conteúdo do pedido");
  });

  it("opens the 360 view from unit search without trusting a client supplied tenant id", () => {
    expect(search).toContain('href={`/platform/unidades/${unit.id}`}');
    expect(resolver).toContain('select("organization_id")');
    expect(resolver).toContain("redirect(`/platform/empresas/${data.organization_id}/unidades/${storeId}`)");
  });

  it("shows recent operational status and sanitized audit history", () => {
    expect(service).toContain('select("id,display_number,order_status,payment_status,production_status,fulfillment_status,created_at,updated_at")');
    expect(service).toContain('select("id,action,entity_type,request_id,created_at")');
    expect(page).toContain("Pedidos recentes");
    expect(page).toContain("Atividade de suporte");
  });
});
