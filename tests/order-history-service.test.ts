import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn() }));
vi.mock("@/server/access/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { OrderHistoryService } from "@/server/orders/order-history-service";
type Row = Record<string, string | number>;
let rows: Row[];
let builders: Query[];
class Query {
  filters: Array<[string, string, unknown]> = [];
  head = false; bounds: [number, number] | null = null;
  select(_fields: string, options?: { head?: boolean }) { this.head = !!options?.head; return this; }
  eq(key: string, value: unknown) { this.filters.push(["eq", key, value]); return this; }
  in(key: string, value: unknown[]) { this.filters.push(["in", key, value]); return this; }
  gte(key: string, value: string) { this.filters.push(["gte", key, value]); return this; }
  lt(key: string, value: string) { this.filters.push(["lt", key, value]); return this; }
  ilike(key: string, value: string) { this.filters.push(["ilike", key, value]); return this; }
  order() { return this; }
  range(start: number, end: number) { this.bounds = [start, end]; return this; }
  then(resolve: (result: { data: Row[] | null; count: number; error: null }) => unknown) {
    let result = rows.filter(row => this.filters.every(([op, key, value]) => op === "eq" ? row[key] === value : op === "in" ? (value as unknown[]).includes(row[key]) : op === "gte" ? String(row[key]) >= String(value) : op === "lt" ? String(row[key]) < String(value) : String(row[key]).toLowerCase().includes(String(value).replaceAll("%", "").toLowerCase())));
    const count = result.length;
    if (this.bounds) result = result.slice(this.bounds[0], this.bounds[1] + 1);
    return Promise.resolve(resolve({ data: this.head ? null : result, count, error: null }));
  }
}
const row = (id: number, created_at: string, changes: Partial<Row> = {}): Row => ({ id, organization_id: "org-a", store_id: "store-a", order_status: "completed", created_at, updated_at: "2026-09-30T04:00:00Z", total_cents: 1000, display_number: id, customer_name_snapshot: "Cliente", ...changes });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T02:19:00Z"));
  mocks.authorize.mockResolvedValue({ organizationId: "org-a", storeId: "store-a", timezone: "America/Sao_Paulo" });
  builders = []; rows = [];
  mocks.from.mockImplementation(() => { const query = new Query(); builders.push(query); return query; });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("history local-day list/count/sales parity [1192]", () => {
  it("uses the store day before UTC midnight and excludes the next local day", async () => {
    rows = [row(1, "2026-09-29T02:59:59Z"), row(2, "2026-09-29T03:00:00Z"), row(3, "2026-09-30T02:59:59Z"), row(4, "2026-09-30T03:00:00Z"), row(5, "2026-09-29T12:00:00Z", { store_id: "store-b" }), row(6, "2026-09-29T12:00:00Z", { organization_id: "org-b" }), row(7, "2026-09-29T12:00:00Z", { order_status: "canceled" })];
    const result = await OrderHistoryService.list({ period: "today" });
    expect(result.dateRange).toMatchObject({ startDate: "2026-09-29", startIso: "2026-09-29T03:00:00.000Z", endIso: "2026-09-30T03:00:00.000Z" });
    expect(result.orders.map(r => r.id)).toEqual([2, 3, 7]);
    expect(result.summary).toEqual({ totalOrders: 3, completedOrders: 2, soldTotalCents: 2000, averageTicketCents: 1000 });
    for (const query of builders) { expect(query.filters).toContainEqual(["eq", "organization_id", "org-a"]); expect(query.filters).toContainEqual(["eq", "store_id", "store-a"]); expect(query.filters).toContainEqual(["gte", "created_at", result.dateRange!.startIso]); expect(query.filters).toContainEqual(["lt", "created_at", result.dateRange!.endIso]); }
  });
  it("summarizes all filtered sales before pagination, excluding active/canceled sales", async () => {
    rows = Array.from({ length: 35 }, (_, i) => row(i, "2026-09-29T18:00:00Z"));
    rows.push(row(99, "2026-09-29T18:00:00Z", { order_status: "confirmed" }), row(100, "2026-09-29T18:00:00Z", { order_status: "rejected" }));
    const result = await OrderHistoryService.list({ period: "date", date: "2026-09-29", page: 2, pageSize: 10 });
    expect(result.orders).toHaveLength(10); expect(result.total).toBe(36);
    expect(result.summary.soldTotalCents).toBe(35000); expect(result.summary.completedOrders).toBe(35);
  });
  it("combines a selected date with order-number search on all three queries", async () => {
    rows = [row(42, "2026-09-29T18:00:00Z"), row(43, "2026-09-29T18:00:00Z"), row(42, "2026-09-28T18:00:00Z")];
    const result = await OrderHistoryService.list({ period: "date", date: "2026-09-29", search: "#42" });
    expect(result.orders).toHaveLength(1); expect(result.total).toBe(1); expect(result.summary.soldTotalCents).toBe(1000);
    for (const query of builders) expect(query.filters).toContainEqual(["eq", "display_number", 42]);
  });
});
