import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260906054000_omnichannel_canonical_order_import.sql", "utf8");
const service = readFileSync("src/server/integrations/runtime/canonical-order-import-service.ts", "utf8");

describe("omnichannel external order import contracts", () => {
  it("materializes external orders through one private atomic RPC", () => {
    expect(migration).toContain("create or replace function public.integration_import_external_order");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("from public.external_orders");
    expect(migration).toContain("'external_order_imported'");
    expect(migration).toContain("'external_order_replayed'");
    expect(migration).toContain("'order.created'");
  });

  it("keeps external payment ownership out of the native automatic payment seed", () => {
    expect(migration).toContain("new.channel in ('pdv','ifood','99food')");
    expect(migration).toContain("'integration'");
    expect(migration).toContain("'external_method'");
    expect(migration).not.toContain("order_payment_provider_reserve_charge_internal");
  });

  it("supports 99Food without creating a parallel orders table", () => {
    expect(migration).toContain("'ifood','99food'");
    expect(migration).not.toContain("create table public.orders_ifood");
    expect(migration).not.toContain("create table public.orders_99");
  });

  it("keeps the RPC server-only and service-role-only", () => {
    expect(migration).toContain("revoke all on function public.integration_import_external_order");
    expect(migration).toContain("to service_role");
    expect(service).toContain('import "server-only"');
    expect(service).toContain('db.rpc("integration_import_external_order"');
    expect(service).not.toContain("scheduleOrderPixCharge");
    expect(service).not.toContain("WhatsApp");
    expect(service).not.toContain("createFromCheckout");
  });

  it("preserves provider additional fees in the canonical order total", () => {
    expect(migration).toContain("add column if not exists additional_fee_cents bigint not null default 0");
    expect(migration).toContain("subtotal_cents - discount_cents + delivery_fee_cents + additional_fee_cents");
  });
});