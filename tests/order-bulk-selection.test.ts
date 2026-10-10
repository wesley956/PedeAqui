import { describe, expect, it } from "vitest";
import { selectBulkOrders, toggleBulkOrder } from "@/features/orders/bulk-selection";

const ids = Array.from({ length: 75 }, (_, i) => `order-${i}`);

describe("bounded bulk selection", () => {
  it("selects at most 50 distinct visible orders in display order", () => {
    expect([...selectBulkOrders(["order-0", ...ids])]).toEqual(ids.slice(0, 50));
  });

  it("rejects a 51st selection while allowing removal and replacement", () => {
    const full = selectBulkOrders(ids);
    expect([...toggleBulkOrder(full, ids, "order-50", true)]).toEqual([...full]);
    const reduced = toggleBulkOrder(full, ids, "order-0", false);
    const replaced = toggleBulkOrder(reduced, ids, "order-50", true);
    expect(replaced.size).toBe(50);
    expect(replaced.has("order-0")).toBe(false);
    expect(replaced.has("order-50")).toBe(true);
  });

  it("discards obsolete selections and rejects orders outside the current eligible list", () => {
    const selection = toggleBulkOrder(new Set(["obsolete", "order-0"]), ids, "not-eligible", true);
    expect([...selection]).toEqual(["order-0"]);
  });
});
