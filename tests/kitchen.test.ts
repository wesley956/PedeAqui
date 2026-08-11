import { describe, expect, it } from "vitest";
import {
  filterKitchenOrdersByStation,
  kitchenElapsedLabel,
  kitchenUrgency,
  type KitchenOrder,
} from "@/features/kitchen/kitchen-model";

const baseOrder: KitchenOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  displayNumber: 42,
  customerName: "Cliente",
  fulfillmentType: "pickup",
  productionStatus: "preparing",
  confirmedAt: "2026-08-10T22:00:00.000Z",
  createdAt: "2026-08-10T21:55:00.000Z",
  items: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      productId: "33333333-3333-4333-8333-333333333333",
      name: "Burger",
      quantity: 1,
      note: null,
      stationIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      modifiers: [],
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      productId: "55555555-5555-4555-8555-555555555555",
      name: "Batata",
      quantity: 1,
      note: null,
      stationIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      modifiers: [],
    },
  ],
};

describe("kitchen model", () => {
  it("keeps every item in the all-stations view", () => {
    const result = filterKitchenOrdersByStation([baseOrder], null);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(2);
  });

  it("filters items and removes orders that do not belong to the selected station", () => {
    const stationA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const result = filterKitchenOrdersByStation([baseOrder], stationA);
    expect(result).toHaveLength(1);
    expect(result[0]?.items.map((item) => item.name)).toEqual(["Burger"]);

    const missing = filterKitchenOrdersByStation([baseOrder], "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(missing).toHaveLength(0);
  });

  it("uses confirmedAt as the production clock when available", () => {
    const now = new Date("2026-08-10T22:09:30.000Z").getTime();
    expect(kitchenElapsedLabel(baseOrder, now)).toBe("9 min");
  });

  it("marks attention after 12 minutes and late after 20 minutes", () => {
    expect(kitchenUrgency(baseOrder, new Date("2026-08-10T22:11:59.000Z").getTime())).toBe("fresh");
    expect(kitchenUrgency(baseOrder, new Date("2026-08-10T22:12:00.000Z").getTime())).toBe("attention");
    expect(kitchenUrgency(baseOrder, new Date("2026-08-10T22:20:00.000Z").getTime())).toBe("late");
  });

  it("falls back to createdAt when the order has no confirmedAt timestamp", () => {
    const order = { ...baseOrder, confirmedAt: null };
    const now = new Date("2026-08-10T22:05:00.000Z").getTime();
    expect(kitchenElapsedLabel(order, now)).toBe("10 min");
  });
});
