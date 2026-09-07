import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260906060500_omnichannel_merchant_scoped_identity.sql",
  "utf8",
);
const repository = readFileSync(
  "src/server/integrations/runtime/runtime-repository.ts",
  "utf8",
);

describe("omnichannel merchant-scoped identity", () => {
  it("deduplicates durable inbox events inside account + store scope", () => {
    expect(migration).toContain("integration_events_account_store_event_uidx");
    expect(migration).toContain("integration_account_id, store_id, external_event_id");
    expect(repository).toContain('onConflict: "integration_account_id,store_id,external_event_id"');
    expect(repository).toContain('.eq("store_id", input.storeId)');
  });

  it("scopes external order identity by resolved integration merchant", () => {
    expect(migration).toContain("external_orders_merchant_order_uidx");
    expect(migration).toContain("integration_merchant_id, external_order_id");
    expect(migration).toContain("v_merchant.id::text");
    expect(migration).toContain("where integration_merchant_id = v_merchant.id");
  });

  it("fails loudly if the earlier canonical import function drifts", () => {
    expect(migration).toContain("could not locate advisory-lock identity expression");
    expect(migration).toContain("could not locate external-order lookup expression");
    expect(migration).toContain("integration_import_external_order body not found");
  });

  it("keeps browser roles unable to invoke the canonical import RPC", () => {
    expect(migration).toContain("revoke all on function public.integration_import_external_order");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
