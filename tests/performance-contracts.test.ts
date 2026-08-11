import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("performance contracts", () => {
  it("indexes order modifiers once instead of filtering every item", () => {
    const orders = source("src/server/orders/order-service.ts");
    expect(orders).toContain("const modifiersByItem = groupOrderModifiers");
    expect(orders).toContain("modifiers: modifiersByItem.get(item.id) ?? []");
    expect(orders).not.toContain("modifiers: (modifiersResult.data ?? []).filter");
  });

  it("keeps KDS independent reads parallel and groups joins with maps", () => {
    const kitchen = source("src/server/kitchen/kitchen-service.ts");
    expect(kitchen).toContain("await Promise.all");
    expect(kitchen).toContain("const modifiersByItem = new Map");
    expect(kitchen).toContain("const stationsByProduct = new Map");
    expect(kitchen).toContain("const itemsByOrder = new Map");
  });

  it("keeps customer profile reads parallel instead of waterfalling", () => {
    const customers = source("src/server/customers/customer-service.ts");
    expect(customers).toContain("const [customerResult, addressesResult, ordersResult, storesResult] = await Promise.all");
  });

  it("keeps dashboard aggregation server-side in a single RPC", () => {
    const dashboard = source("src/server/dashboard/dashboard-service.ts");
    expect(dashboard).toContain('rpc("dashboard_snapshot_internal"');
  });
});
