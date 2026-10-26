import { describe, expect, it } from "vitest";
import { isOrderAttentionLate, orderCountdownLabel, ORDER_ATTENTION_MINUTES } from "@/features/orders/manager-model";

const createdAt = "2026-10-25T12:00:00.000Z";
const order = { created_at: createdAt, order_status: "confirmed" as const };

describe("60-minute countdown in Pedidos", () => {
  it("shows the full hour at order creation", () => {
    expect(ORDER_ATTENTION_MINUTES).toBe(60);
    expect(orderCountdownLabel(createdAt, Date.parse(createdAt))).toBe("60:00");
  });
  it("counts down and marks overdue at exactly 60 minutes", () => {
    expect(orderCountdownLabel(createdAt, Date.parse(createdAt) + 45 * 60000)).toBe("15:00");
    expect(isOrderAttentionLate(order, Date.parse(createdAt) + 59 * 60000)).toBe(false);
    expect(orderCountdownLabel(createdAt, Date.parse(createdAt) + 60 * 60000)).toBe("Atrasado");
    expect(isOrderAttentionLate(order, Date.parse(createdAt) + 60 * 60000)).toBe(true);
  });
  it("does not flag finished or cancelled orders as late", () => {
    for (const status of ["completed", "canceled", "rejected"] as const) {
      expect(isOrderAttentionLate({ created_at: createdAt, order_status: status }, Date.parse(createdAt) + 65 * 60000)).toBe(false);
    }
  });
  it("does not treat invalid timestamps as overdue", () => {
    expect(orderCountdownLabel("invalid", Date.now())).toBe("Prazo indisponível");
  });
});
