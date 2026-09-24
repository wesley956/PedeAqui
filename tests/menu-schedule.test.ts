import { describe, expect, it } from "vitest";
import { assertNoScheduleOverlap, isOpenAt, nextOpening } from "@/server/menu/schedule";
import { storeHourInputSchema } from "@/server/menu/schemas";

describe("store schedule", () => {
  it("accepts an overnight period", () => {
    expect(storeHourInputSchema.parse({ weekday: 5, opensAt: "18:00", closesAt: "02:00", closesNextDay: true, sortOrder: 0, active: true })).toBeTruthy();
  });

  it("rejects an inverted same-day period", () => {
    expect(() => storeHourInputSchema.parse({ weekday: 5, opensAt: "18:00", closesAt: "02:00", closesNextDay: false, sortOrder: 0, active: true })).toThrow();
  });

  it("detects overlaps including overnight into the next day", () => {
    expect(() => assertNoScheduleOverlap([
      { weekday: 5, opensAt: "18:00", closesAt: "02:00", closesNextDay: true },
      { weekday: 6, opensAt: "01:00", closesAt: "03:00", closesNextDay: false },
    ])).toThrow("Store hours overlap");
  });

  it("reports open after midnight for previous-day overnight period", () => {
    const hours = [{ weekday: 5, opens_at: "18:00", closes_at: "02:00", closes_next_day: true }];
    const saturdayOneAmInSaoPaulo = new Date("2026-08-08T04:00:00.000Z");
    expect(isOpenAt(hours, "America/Sao_Paulo", saturdayOneAmInSaoPaulo)).toBe(true);
  });

  it("accepts PostgreSQL time values returned with seconds", () => {
    const hours = [{ weekday: 0, opens_at: "14:00:00", closes_at: "23:59:00", closes_next_day: false }];
    const sundayThreeThirtyAmInSaoPaulo = new Date("2026-09-20T06:30:00.000Z");

    expect(isOpenAt(hours, "America/Sao_Paulo", sundayThreeThirtyAmInSaoPaulo)).toBe(false);
    expect(nextOpening(hours, "America/Sao_Paulo", sundayThreeThirtyAmInSaoPaulo)).toMatchObject({
      weekday: 0,
      opensAt: "14:00",
      daysAhead: 0,
      label: "hoje às 14:00",
    });
  });

  it("returns today's next opening before the first shift", () => {
    const hours = [{ weekday: 6, opens_at: "18:00", closes_at: "23:00", closes_next_day: false }];
    const saturdayFivePmInSaoPaulo = new Date("2026-09-19T20:00:00.000Z");
    expect(nextOpening(hours, "America/Sao_Paulo", saturdayFivePmInSaoPaulo)).toEqual({
      weekday: 6,
      opensAt: "18:00",
      daysAhead: 0,
      label: "hoje às 18:00",
    });
  });

  it("returns tomorrow when today's shift already ended", () => {
    const hours = [
      { weekday: 6, opens_at: "18:00", closes_at: "23:00", closes_next_day: false },
      { weekday: 0, opens_at: "17:30", closes_at: "22:00", closes_next_day: false },
    ];
    const saturdayElevenThirtyPmInSaoPaulo = new Date("2026-09-20T02:30:00.000Z");
    expect(nextOpening(hours, "America/Sao_Paulo", saturdayElevenThirtyPmInSaoPaulo)).toEqual({
      weekday: 0,
      opensAt: "17:30",
      daysAhead: 1,
      label: "amanhã às 17:30",
    });
  });

  it("returns null when the store has no active schedule", () => {
    expect(nextOpening([], "America/Sao_Paulo", new Date("2026-09-19T20:00:00.000Z"))).toBeNull();
  });
});
