import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const realtime = read("src/features/delivery/delivery-realtime.tsx");
const deliveriesPage = read("src/app/(app)/entregas/page.tsx");
const driversPage = read("src/app/(app)/configuracoes/entregadores/page.tsx");
const migration = read("supabase/sql/149_delivery_realtime.sql");
const deliveryCore = read("supabase/sql/52_delivery_operations_core.sql");

describe("delivery realtime stabilization", () => {
  it("registers delivery tables in the managed publication idempotently", () => {
    expect(migration).toContain("pg_catalog.pg_publication_tables");
    expect(migration).toContain("array['deliveries', 'drivers']");
    expect(migration).toContain("alter publication supabase_realtime add table");
    expect(migration).toContain("if not exists");
  });

  it("keeps Realtime delivery rows protected by existing RLS read policies", () => {
    expect(deliveryCore).toContain("alter table public.drivers enable row level security");
    expect(deliveryCore).toContain("alter table public.deliveries enable row level security");
    expect(deliveryCore).toContain("create policy drivers_view");
    expect(deliveryCore).toContain("create policy deliveries_view");
    expect(deliveryCore).toContain("private.has_permission");
  });

  it("coalesces rapid events and uses a bounded degraded fallback", () => {
    expect(realtime).toContain("REFRESH_COALESCE_MS = 200");
    expect(realtime).toContain("DEGRADED_REFRESH_MS = 30_000");
    expect(realtime).toContain("if (refreshTimerRef.current !== null) return");
    expect(realtime).toContain('window.addEventListener("online"');
    expect(realtime).toContain('document.addEventListener("visibilitychange"');
    expect(realtime).toContain('statusRef.current !== "connected"');
  });

  it("subscribes both operational screens without trusting event payloads", () => {
    expect(realtime).toContain('["orders", "deliveries", "drivers"]');
    expect(realtime).not.toContain("payload.new");
    expect(deliveriesPage).toContain("<DeliveryRealtime");
    expect(deliveriesPage).toContain("showStatus");
    expect(driversPage).toContain("DRIVER_SETTINGS_REALTIME_TABLES");
    expect(driversPage).toContain("<DeliveryRealtime");
  });
});
