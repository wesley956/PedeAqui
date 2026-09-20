import { describe, expect, it } from "vitest";
import {
  resolveStoreOperationalStatus,
  storeClosedOrderMessage,
  storeOperationalHoursMessage,
} from "@/server/menu/store-operational-status-core";

const saturdayHours = [{ weekday: 6, opens_at: "18:00", closes_at: "23:00", closes_next_day: false }];
const saturdaySevenPmSaoPaulo = new Date("2026-09-19T22:00:00.000Z");
const saturdayFivePmSaoPaulo = new Date("2026-09-19T20:00:00.000Z");

function resolve(overrides: Partial<Parameters<typeof resolveStoreOperationalStatus>[0]> = {}) {
  return resolveStoreOperationalStatus({
    storeStatus: "active",
    acceptingOrders: true,
    pauseReason: null,
    allowDelivery: true,
    allowPickup: true,
    hours: saturdayHours,
    timeZone: "America/Sao_Paulo",
    now: saturdaySevenPmSaoPaulo,
    ...overrides,
  });
}

describe("store operational status", () => {
  it("allows orders only when the store is active, inside schedule and accepting orders", () => {
    const status = resolve();
    expect(status.canOrder).toBe(true);
    expect(status.scheduleOpen).toBe(true);
    expect(status.label).toBe("open");
    expect(status.reason).toBe("open");
    expect(storeOperationalHoursMessage(status)).toContain("aberta agora");
  });

  it("blocks before opening and exposes the next opening in the store timezone", () => {
    const status = resolve({ now: saturdayFivePmSaoPaulo });
    expect(status.canOrder).toBe(false);
    expect(status.scheduleOpen).toBe(false);
    expect(status.label).toBe("closed");
    expect(status.reason).toBe("closed_hours");
    expect(status.nextOpening?.label).toBe("hoje às 18:00");
    expect(storeClosedOrderMessage(status)).toContain("hoje às 18:00");
  });

  it("blocks outside hours when Supabase returns PostgreSQL time values with seconds", () => {
    const status = resolve({
      hours: [{ weekday: 0, opens_at: "14:00:00", closes_at: "23:59:00", closes_next_day: false }],
      now: new Date("2026-09-20T06:31:58.000Z"),
    });

    expect(status.canOrder).toBe(false);
    expect(status.reason).toBe("closed_hours");
    expect(storeClosedOrderMessage(status)).toContain("hoje às 14:00");
  });

  it("blocks a paused store even during opening hours and preserves the configured reason", () => {
    const status = resolve({ acceptingOrders: false, pauseReason: "Pausa para reorganização" });
    expect(status.canOrder).toBe(false);
    expect(status.scheduleOpen).toBe(true);
    expect(status.label).toBe("paused");
    expect(status.reason).toBe("orders_paused");
    expect(storeClosedOrderMessage(status)).toContain("Pausa para reorganização");
  });

  it("blocks an administratively unavailable store regardless of schedule", () => {
    const status = resolve({ storeStatus: "temporarily_closed" });
    expect(status.canOrder).toBe(false);
    expect(status.scheduleOpen).toBe(false);
    expect(status.label).toBe("closed");
    expect(status.reason).toBe("store_unavailable");
    expect(storeClosedOrderMessage(status)).toContain("não está aceitando novos pedidos");
  });

  it("carries delivery and pickup capabilities without changing the open decision", () => {
    const status = resolve({ allowDelivery: false, allowPickup: true });
    expect(status.canOrder).toBe(true);
    expect(status.allowDelivery).toBe(false);
    expect(status.allowPickup).toBe(true);
  });
});
