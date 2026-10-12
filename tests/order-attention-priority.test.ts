import { describe, expect, it } from "vitest";
import { sortOrdersForAttention, type OrderManagerRow } from "@/features/orders/manager-model";

const order = (display_number: number, overrides: Partial<OrderManagerRow> = {}): OrderManagerRow => ({
  id: String(display_number), display_number, channel: "menu", fulfillment_type: "pickup", order_status: "confirmed", payment_status: "paid", production_status: "ready", fulfillment_status: "pending", customer_name_snapshot: "Cliente", total_cents: 1000, created_at: "2026-10-12T12:00:00Z", updated_at: "2026-10-12T12:00:00Z", ...overrides,
});

describe("attention queue preserves operational priority", () => {
  it("puts new confirmations before old already served reconciliation", () => {
    const reconcile = order(1, { fulfillment_status: "picked_up_by_customer", created_at: "2026-10-10T12:00:00Z" });
    const incoming = order(2, { order_status: "pending_confirmation", production_status: "pending_confirmation" });
    const input = [reconcile, incoming];
    expect(sortOrdersForAttention(input).map((row) => row.display_number)).toEqual([2, 1]);
    expect(input).toEqual([reconcile, incoming]);
    expect(reconcile.order_status).toBe("confirmed");
  });
  it("orders oldest first within a stage without dropping external or unpaid orders", () => {
    const rows = [order(1, { created_at: "2026-10-12T12:05:00Z", payment_status: "pending", channel: "ifood" }), order(2)];
    expect(sortOrdersForAttention(rows).map((row) => row.display_number)).toEqual([2, 1]);
  });
  it("keeps payment pending deliveries visible before completed-history rows", () => {
    const rows = [order(1, { order_status: "completed", fulfillment_status: "delivered" }), order(2, { payment_status: "pending", fulfillment_type: "delivery", fulfillment_status: "delivered" })];
    expect(sortOrdersForAttention(rows).map((row) => row.display_number)).toEqual([2, 1]);
  });
});
