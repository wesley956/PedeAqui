import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260906055500_omnichannel_capability_scoped_claims.sql",
  "utf8",
);
const repository = readFileSync(
  "src/server/integrations/runtime/runtime-repository.ts",
  "utf8",
);
const workers = readFileSync(
  "src/server/integrations/runtime/workers.ts",
  "utf8",
);
const orderWorker = readFileSync(
  "src/server/integrations/runtime/external-order-inbox-handler.ts",
  "utf8",
);

describe("omnichannel capability-scoped inbox claims", () => {
  it("filters candidates inside the atomic database claim", () => {
    expect(migration).toContain("p_capabilities text[] default null");
    expect(migration).toContain("e.capability = any(p_capabilities)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("integration_events_capability_pending_idx");
  });

  it("uses invoker execution and service-role-only grants", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.integration_claim_events(integer, text, integer, text[])");
    expect(migration).toContain("grant execute on function public.integration_claim_events(integer, text, integer, text[])");
    expect(migration).toContain("to service_role");
  });

  it("propagates the filter from worker to repository RPC", () => {
    expect(workers).toContain("capabilities?: readonly string[]");
    expect(workers).toContain("input.capabilities");
    expect(repository).toContain("p_capabilities: capabilities ? [...capabilities] : null");
  });

  it("binds the external-order worker only to sales-order capabilities", () => {
    expect(orderWorker).toContain('EXTERNAL_ORDER_INBOX_CAPABILITIES = ["ifood_orders", "99food_orders"]');
    expect(orderWorker).toContain("capabilities: EXTERNAL_ORDER_INBOX_CAPABILITIES");
  });
});
