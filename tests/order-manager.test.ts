import { describe, expect, it } from "vitest";
import {
  ORDER_ATTENTION_MINUTES,
  canCompleteFromManager,
  completionBlockers,
  deriveOperationalBucket,
  deriveOrderLane,
  elapsedLabel,
  isOrderAttentionLate,
  type OrderManagerRow,
} from "@/features/orders/manager-model";

function order(overrides: Partial<OrderManagerRow> = {}): OrderManagerRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    display_number: 42,
    channel: "menu",
    fulfillment_type: "pickup",
    order_status: "pending_confirmation",
    payment_status: "pending",
    production_status: "pending_confirmation",
    fulfillment_status: "pending",
    customer_name_snapshot: "Maria",
    total_cents: 4200,
    created_at: "2026-08-10T20:00:00.000Z",
    updated_at: "2026-08-10T20:00:00.000Z",
    ...overrides,
  };
}

describe("order manager lanes", () => {
  it("puts pending confirmation orders in Novos", () => {
    expect(deriveOrderLane(order())).toBe("new");
  });

  it("keeps confirmed orders outside production in Confirmados", () => {
    expect(deriveOrderLane(order({ order_status: "confirmed" }))).toBe("confirmed");
  });

  it("puts preparing orders in Em produção", () => {
    expect(deriveOrderLane(order({ order_status: "confirmed", production_status: "preparing" }))).toBe("preparing");
  });

  it("puts ready orders in Prontos", () => {
    expect(deriveOrderLane(order({ order_status: "confirmed", production_status: "ready" }))).toBe("ready");
  });

  it("always sends terminal order states to Finalizados", () => {
    expect(deriveOrderLane(order({ order_status: "completed", production_status: "ready" }))).toBe("finished");
    expect(deriveOrderLane(order({ order_status: "canceled", production_status: "preparing" }))).toBe("finished");
    expect(deriveOrderLane(order({ order_status: "rejected" }))).toBe("finished");
  });
});

describe("order manager timing", () => {
  it("formats minutes and hours from a stable clock", () => {
    const created = "2026-08-10T20:00:00.000Z";
    expect(elapsedLabel(created, Date.parse("2026-08-10T20:00:30.000Z"))).toBe("agora");
    expect(elapsedLabel(created, Date.parse("2026-08-10T20:17:00.000Z"))).toBe("17 min");
    expect(elapsedLabel(created, Date.parse("2026-08-10T21:25:00.000Z"))).toBe("1h 25m");
  });

  it("treats 30 minutes as a visual attention threshold only for active orders", () => {
    const created = "2026-08-10T20:00:00.000Z";
    const beforeThreshold = Date.parse("2026-08-10T20:29:59.000Z");
    const atThreshold = Date.parse("2026-08-10T20:30:00.000Z");
    expect(ORDER_ATTENTION_MINUTES).toBe(30);
    expect(isOrderAttentionLate(order({ created_at: created }), beforeThreshold)).toBe(false);
    expect(isOrderAttentionLate(order({ created_at: created }), atThreshold)).toBe(true);
    expect(isOrderAttentionLate(order({ created_at: created, order_status: "completed" }), atThreshold)).toBe(false);
  });
});

describe("operational order buckets", () => {
  it("keeps active orders in presentation buckets derived from authoritative states", () => {
    expect(deriveOperationalBucket(order())).toBe("new");
    expect(deriveOperationalBucket(order({ order_status: "confirmed", production_status: "preparing" }))).toBe("preparing");
    expect(deriveOperationalBucket(order({ order_status: "confirmed", production_status: "ready" }))).toBe("ready");
    expect(deriveOperationalBucket(order({ order_status: "confirmed", production_status: "queued" }))).toBe("queued");
  });

  it("keeps an old order in its operational bucket and marks lateness independently", () => {
    const lateNow = Date.parse("2026-08-10T20:31:00.000Z");
    const preparing = order({ order_status: "confirmed", production_status: "preparing" });
    expect(deriveOperationalBucket(preparing)).toBe("preparing");
    expect(isOrderAttentionLate(preparing, lateNow)).toBe(true);
  });

  it("keeps terminal orders in history even when they are older than the attention threshold", () => {
    const lateNow = Date.parse("2026-08-10T22:00:00.000Z");
    const completed = order({ order_status: "completed" });
    const canceled = order({ order_status: "canceled" });
    const rejected = order({ order_status: "rejected" });
    expect(deriveOperationalBucket(completed)).toBe("history");
    expect(deriveOperationalBucket(canceled)).toBe("history");
    expect(deriveOperationalBucket(rejected)).toBe("history");
    expect(isOrderAttentionLate(completed, lateNow)).toBe(false);
    expect(isOrderAttentionLate(canceled, lateNow)).toBe(false);
    expect(isOrderAttentionLate(rejected, lateNow)).toBe(false);
  });
});

describe("order completion gating", () => {
  it("allows completion after fulfillment for paid or refunded payments", () => {
    const base = order({
      order_status: "confirmed",
      fulfillment_status: "picked_up_by_customer",
    });
    expect(canCompleteFromManager({ ...base, payment_status: "paid" })).toBe(true);
    expect(canCompleteFromManager({ ...base, payment_status: "partially_refunded" })).toBe(true);
    expect(canCompleteFromManager({ ...base, payment_status: "refunded" })).toBe(true);
    expect(completionBlockers({ ...base, payment_status: "refunded" })).toEqual([]);
  });

  it("shows only the blocker relevant to the current operational stage", () => {
    const awaitingConfirmation = order({ order_status: "pending_confirmation", payment_status: "pending", fulfillment_status: "pending" });
    expect(canCompleteFromManager(awaitingConfirmation)).toBe(false);
    expect(completionBlockers(awaitingConfirmation)).toEqual(["pedido não está confirmado"]);

    const inFulfillment = order({ order_status: "confirmed", payment_status: "pending", fulfillment_status: "out_for_delivery" });
    expect(canCompleteFromManager(inFulfillment)).toBe(false);
    expect(completionBlockers(inFulfillment)).toEqual([]);

    const awaitingPaymentAfterFulfillment = order({ order_status: "confirmed", payment_status: "pending", fulfillment_status: "delivered" });
    expect(canCompleteFromManager(awaitingPaymentAfterFulfillment)).toBe(false);
    expect(completionBlockers(awaitingPaymentAfterFulfillment)).toEqual(["pagamento ainda não está liquidado"]);
  });
});
