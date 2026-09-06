import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260906044000_omnichannel_integration_core.sql", "utf8");

describe("omnichannel integration persistence contracts", () => {
  it("creates durable inbox/outbox and canonical external-order links", () => {
    expect(migration).toContain("create table if not exists public.integration_events");
    expect(migration).toContain("create table if not exists public.integration_outbox");
    expect(migration).toContain("create table if not exists public.external_orders");
    expect(migration).toContain("unique (integration_account_id, external_event_id)");
    expect(migration).toContain("unique (integration_account_id, idempotency_key)");
    expect(migration).toContain("unique (integration_account_id, external_order_id)");
  });

  it("keeps every marketplace capability disabled when a merchant is created", () => {
    for (const key of [
      "ifood_orders",
      "ifood_catalog",
      "ifood_shipping",
      "99food_orders",
      "99food_menu",
      "99food_logistics",
      "99entrega",
    ]) {
      expect(migration).toContain(`\"${key}\": false`);
    }
  });

  it("keeps provider infrastructure private from browser roles", () => {
    expect(migration).toContain("revoke all on table public.%I from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.%I to service_role");
    expect(migration).not.toContain("grant select on table public.integration_events to authenticated");
  });

  it("keeps payment and logistics ownership explicit", () => {
    expect(migration).toContain("payment_owner text not null");
    expect(migration).toContain("logistics_owner text");
    expect(migration).toContain("sync_status text not null default 'pending'");
  });
});
