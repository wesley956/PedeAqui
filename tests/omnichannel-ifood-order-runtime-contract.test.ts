import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("iFood #939 runtime contracts", () => {
  it("keeps the route protected and the server composition free of browser credentials", () => {
    const route = read("src/app/api/internal/ifood-order-intake/route.ts");
    const worker = read("src/server/integrations/providers/ifood/ifood-order-worker.ts");
    expect(route).toContain('authorizeInternalJob(request, "ifood_order_intake")');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toContain("accessToken");
    expect(worker).toContain('import "server-only"');
    expect(worker).toContain("CanonicalOrderImportService.import(orderInput)");
    expect(worker).toContain("IntegrationRuntimeRepository");
  });

  it("stores PII-free SLA timestamps and leaves the scheduler paused", () => {
    const sql = read("supabase/sql/203_ifood_order_intake_runtime_sla.sql");
    for (const field of ["provider_created_at", "received_at", "imported_at", "confirmation_deadline"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("integration_ifood_confirmation_sla");
    expect(sql).toContain("'30 seconds'");
    expect(sql).toContain("active => false");
    expect(sql).toContain("from public, anon, authenticated");
    for (const forbidden of ["customer_name_snapshot", "customer_phone_snapshot", "address_street_snapshot"]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});

