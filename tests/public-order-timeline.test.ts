import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPublicOrderTimeline } from "@/features/orders/public-order-timeline";

describe("public order timeline", () => {
  it("uses delivery states without inventing departure", () => {
    const timeline = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "assigned" });
    expect(timeline.find((step) => step.key === "ready")?.state).toBe("current");
    expect(timeline.find((step) => step.key === "out")?.state).toBe("upcoming");
    expect(timeline.find((step) => step.key === "delivered")?.state).toBe("upcoming");
    expect(timeline.some((step) => step.key === "confirmed")).toBe(false);
  });

  it("marks departure and delivery only from authoritative fulfillment states", () => {
    const out = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "out_for_delivery" });
    expect(out.find((step) => step.key === "out")?.state).toBe("current");
    const delivered = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "completed", productionStatus: "ready", fulfillmentStatus: "delivered" });
    expect(delivered.find((step) => step.key === "delivered")?.state).toBe("current");
  });

  it("uses a pickup journey without delivery-only steps", () => {
    const timeline = buildPublicOrderTimeline({ fulfillmentType: "pickup", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "awaiting_pickup" });
    expect(timeline.some((step) => step.key === "out" || step.key === "delivered")).toBe(false);
    expect(timeline.find((step) => step.key === "ready")).toMatchObject({ label: "Pronto para retirada", state: "current" });
    expect(timeline.find((step) => step.key === "pickup")?.state).toBe("upcoming");
  });

  it("skips production milestones when production is explicitly not required while preserving pickup milestones", () => {
    const timeline = buildPublicOrderTimeline({ fulfillmentType: "pickup", orderStatus: "confirmed", productionStatus: "not_required", fulfillmentStatus: "picked_up_by_customer" });
    expect(timeline.some((step) => step.key === "preparing")).toBe(false);
    expect(timeline.find((step) => step.key === "ready")?.label).toBe("Pronto para retirada");
    expect(timeline.find((step) => step.key === "pickup")?.state).toBe("current");
  });

  it("shows an explicit terminal step for rejected and canceled orders", () => {
    const rejected = buildPublicOrderTimeline({ fulfillmentType: "pickup", orderStatus: "rejected", productionStatus: "canceled", fulfillmentStatus: "canceled" });
    expect(rejected.map((step) => [step.key, step.state])).toEqual([["received", "done"], ["rejected", "current"]]);
    expect(rejected.at(-1)?.label).toBe("Pedido recusado");
    const canceled = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "canceled", productionStatus: "canceled", fulfillmentStatus: "canceled" });
    expect(canceled.at(-1)).toMatchObject({ key: "canceled", label: "Pedido cancelado", state: "current" });
  });

  it("avoids refresh polling while the tab is hidden", () => {
    const refresh = readFileSync("src/features/orders/public-order-refresh.tsx", "utf8");
    expect(refresh).toContain('document.visibilityState === "visible"');
    expect(refresh).toContain("visibilitychange");
    expect(refresh).toContain("window.addEventListener(\"focus\"");
  });
});
