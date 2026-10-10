import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, order } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; columns: string; filters: Array<[string, unknown]> }>,
  order: { id: "order-1", display_number: 1, payment_status: "pending", payment_method_snapshot: "cash", order_status: "confirmed" },
}));

vi.mock("@/server/access/authorize", () => ({ authorize: vi.fn(async () => ({ organizationId: "org-1", storeId: "store-1" })) }));
vi.mock("@/server/checkout/checkout-service", () => ({ CheckoutService: {}, CheckoutError: Error }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const call = { table, columns: "", filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const result = () => {
        const source = table === "orders" ? [order] : [];
        return { data: source.map(row => Object.fromEntries(call.columns.split(",").map(column => column.trim()).map(column => [column, row[column as keyof typeof order]]))), error: null };
      };
      const query = {
        select: (columns: string) => { call.columns = columns; return query; },
        eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
        not: () => query, order: () => query, in: () => query, gte: () => query,
        range: async () => result(), limit: async () => result(),
        maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));

import { OrderService } from "@/server/orders/order-service";
import { OrderPresentationService } from "@/server/orders/order-presentation-service";

describe("payment method survives manager queries", () => {
  beforeEach(() => { calls.length = 0; });

  it("returns the method in the initial active queue and recent orders", async () => {
    const result = await OrderService.list();
    expect(result.orders[0]?.payment_method_snapshot).toBe("cash");
    expect(result.recentFinalized[0]?.payment_method_snapshot).toBe("cash");
  });

  it("keeps the same method after incremental resolution and enrichment", async () => {
    const row = await OrderPresentationService.getManagerRow("order-1");
    expect(row?.payment_method_snapshot).toBe("cash");
    for (const call of calls) {
      expect(call.filters).toContainEqual(["organization_id", "org-1"]);
      expect(call.filters).toContainEqual(["store_id", "store-1"]);
    }
  });
});
