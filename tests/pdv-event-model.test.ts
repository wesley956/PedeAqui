import { describe, expect, it } from "vitest";
import { projectEventStock, eventTemporarilyClosesStore, validateEventWindow } from "../src/features/pdv/event-model";

describe("event inventory projection", () => {
  const stock = [{ productId: "a", available: 3 }, { productId: "b", available: 2 }];
  it("aggregates repeated product lines without mutating stock", () => {
    expect(projectEventStock(stock, [{ productId: "a", quantity: 1 }, { productId: "a", quantity: 2 }])).toEqual([{ productId: "a", available: 0 }, stock[1]]);
    expect(stock[0].available).toBe(3);
  });
  it("rejects overselling across repeated lines", () => {
    expect(() => projectEventStock(stock, [{ productId: "a", quantity: 2 }, { productId: "a", quantity: 2 }])).toThrow();
  });
  it("rejects unknown products and invalid quantities", () => {
    for (const item of [{ productId: "c", quantity: 1 }, { productId: "a", quantity: 0 }, { productId: "a", quantity: 0.5 }]) expect(() => projectEventStock(stock, [item])).toThrow();
  });
});
describe("event closure window", () => {
  const event = { startsAt: "2026-12-04T18:00:00-03:00", endsAt: "2026-12-05T01:00:00-03:00", storeOpen: false, closureReason: "Evento" };
  it("closes only within the configured interval", () => {
    expect(eventTemporarilyClosesStore(event, Date.parse(event.startsAt)-1)).toBe(false);
    expect(eventTemporarilyClosesStore(event, Date.parse(event.startsAt))).toBe(true);
    expect(eventTemporarilyClosesStore(event, Date.parse(event.endsAt))).toBe(false);
    expect(eventTemporarilyClosesStore({...event, storeOpen: true}, Date.parse(event.startsAt))).toBe(false);
  });
  it("requires a closure reason and valid period", () => {
    expect(() => validateEventWindow({...event, closureReason: " "})).toThrow();
    expect(() => validateEventWindow({...event, endsAt: event.startsAt})).toThrow();
  });
});
