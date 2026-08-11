import { describe, expect, it } from "vitest";
import { assertNoScheduleOverlap, isOpenAt } from "@/server/menu/schedule";
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
});
