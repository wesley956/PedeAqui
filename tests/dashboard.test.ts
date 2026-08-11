import { describe, expect, it } from "vitest";
import { dashboardSnapshotSchema, hourlyBarPercent, maxHourlySales, percentageDelta } from "@/server/dashboard/dashboard-model";

function hourly() {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hour === 12 ? 2 : 0, sales_cents: hour === 12 ? 4500 : 0 }));
}

describe("dashboard snapshot", () => {
  it("accepts a complete 24-hour operational snapshot", () => {
    const snapshot = dashboardSnapshotSchema.parse({
      store_id: "33333333-3333-4333-8333-333333333333",
      organization_id: "22222222-2222-4222-8222-222222222222",
      timezone: "America/Sao_Paulo",
      local_date: "2026-08-11",
      generated_at: "2026-08-11T04:00:00+00:00",
      sales_count: 2,
      sales_cents: 4500,
      average_ticket_cents: 2250,
      customer_count: 1,
      open_orders: 3,
      previous_sales_count: 1,
      previous_sales_cents: 2000,
      hourly: hourly(),
      top_products: [{ product_key: "product-1", name: "Burger", quantity: 3, sales_cents: 4500 }],
    });
    expect(snapshot.hourly).toHaveLength(24);
    expect(snapshot.top_products[0]?.quantity).toBe(3);
  });

  it("rejects an incomplete hourly series", () => {
    const points = hourly().slice(0, 23);
    expect(() => dashboardSnapshotSchema.parse({
      store_id: "33333333-3333-4333-8333-333333333333",
      organization_id: "22222222-2222-4222-8222-222222222222",
      timezone: "America/Sao_Paulo",
      local_date: "2026-08-11",
      generated_at: "2026-08-11T04:00:00+00:00",
      sales_count: 0,
      sales_cents: 0,
      average_ticket_cents: 0,
      customer_count: 0,
      open_orders: 0,
      previous_sales_count: 0,
      previous_sales_cents: 0,
      hourly: points,
      top_products: [],
    })).toThrow();
  });
});

describe("dashboard comparisons", () => {
  it("computes percentage change against yesterday", () => {
    expect(percentageDelta(150, 100)).toBe(50);
    expect(percentageDelta(50, 100)).toBe(-50);
    expect(percentageDelta(0, 0)).toBe(0);
    expect(percentageDelta(10, 0)).toBeNull();
  });

  it("scales hourly bars without hiding non-zero sales", () => {
    const points = hourly();
    expect(maxHourlySales(points)).toBe(4500);
    expect(hourlyBarPercent(4500, 4500)).toBe(100);
    expect(hourlyBarPercent(1, 4500)).toBeGreaterThanOrEqual(4);
    expect(hourlyBarPercent(0, 4500)).toBe(0);
  });
});
