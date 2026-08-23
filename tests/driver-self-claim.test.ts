import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/sql/131_driver_self_claim.sql");
const service = read("src/server/delivery/delivery-operations-service.ts");
const page = read("src/app/(app)/entregador/page.tsx");
const form = read("src/features/delivery/operation-forms.tsx");
const settings = read("src/features/platform/operational-settings-form.tsx");

describe("driver self-claim delivery mode", () => {
  it("is opt-in and keeps manual assignment as the default", () => {
    expect(sql).toContain("deliveries_driver_self_claim_enabled boolean not null default false");
    expect(settings).toContain("Entregadores podem pegar pedidos disponíveis");
    expect(settings).toContain("A atribuição manual continua disponível como alternativa");
  });

  it("serializes claims at the order row and never reassigns a claimed delivery", () => {
    expect(sql).toContain("from public.orders where id=p_order_id for update");
    expect(sql).toContain("raise exception 'delivery already claimed'");
    expect(sql).toContain("public.delivery_assign_internal");
    expect(sql).toContain("claim_mode','self_service'");
  });

  it("reuses canonical driver capacity checks instead of trusting the UI", () => {
    expect(service).toContain("delivery_self_claim_internal");
    expect(service).toContain("PERMISSIONS.DELIVERY_UPDATE");
    expect(page).toContain("activeDeliveryCount");
    expect(page).toContain("max_active_deliveries");
    expect(page).toContain("Limite atingido");
  });

  it("shows only privacy-safe order data before a driver claims it", () => {
    const availableQuery = service.slice(service.indexOf('const availableResult ='));
    expect(availableQuery).toContain("address_district_snapshot,address_city_snapshot,total_cents");
    expect(availableQuery).not.toContain("customer_phone_snapshot");
    expect(page).toContain("Pedidos disponíveis");
    expect(page).toContain("Pegar pedido");
    expect(page).toContain("dados do cliente aparecem somente depois que você pegar o pedido");
  });

  it("keeps the current assigned-delivery journey after a claim", () => {
    expect(form).toContain('claim: "Pegar pedido"');
    for (const intent of ["picked_up", "out_for_delivery", "delivered"]) expect(page).toContain(`intent=\"${intent}\"`);
  });
});
