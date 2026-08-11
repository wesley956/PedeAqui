import { describe, expect, it } from "vitest";
import {
  canCompleteFromManager,
  completionBlockers,
  deriveOrderLane,
  elapsedLabel,
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
});

describe("order completion gating", () => {
  it("allows completion only when payment and fulfillment are complete", () => {
    const ready = order({
      order_status: "confirmed",
      payment_status: "paid",
      fulfillment_status: "picked_up_by_customer",
    });
    expect(canCompleteFromManager(ready)).toBe(true);
    expect(completionBlockers(ready)).toEqual([]);
  });

  it("explains all blockers without inventing a combined status", () => {
    const blocked = order({ order_status: "pending_confirmation", payment_status: "pending", fulfillment_status: "pending" });
    expect(canCompleteFromManager(blocked)).toBe(false);
    expect(completionBlockers(blocked)).toEqual([
      "pedido não está confirmado",
      "pagamento não está pago",
      "entrega/retirada não foi concluída",
    ]);
  });
});
