import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPublicOrderTimeline } from "@/features/orders/public-order-timeline";

describe("public order timeline", () => {
  it("uses delivery states without inventing departure", () => {
    const timeline = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "assigned" });
    expect(timeline.find((step) => step.key === "ready")?.state).toBe("current");
    expect(timeline.find((step) => step.key === "out")?.state).toBe("upcoming");
    expect(timeline.find((step) => step.key === "delivered")?.state).toBe("upcoming");
  });

  it("marks departure and delivery only from authoritative fulfillment states", () => {
    const out = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "out_for_delivery" });
    expect(out.find((step) => step.key === "out")?.state).toBe("current");
    const delivered = buildPublicOrderTimeline({ fulfillmentType: "delivery", orderStatus: "completed", productionStatus: "ready", fulfillmentStatus: "delivered" });
    expect(delivered.find((step) => step.key === "delivered")?.state).toBe("current");
  });

  it("uses a pickup journey without delivery-only steps", () => {
    const timeline = buildPublicOrderTimeline({ fulfillmentType: "pickup", orderStatus: "confirmed", productionStatus: "ready", fulfillmentStatus: "awaiting_pickup" });
    expect(timeline.some((step) => step.key === "out")).toBe(false);
    expect(timeline.find((step) => step.key === "ready")?.state).toBe("current");
    expect(timeline.find((step) => step.key === "pickup")?.state).toBe("upcoming");
  });

  it("skips production milestones when production is explicitly not required", () => {
    const timeline = buildPublicOrderTimeline({ fulfillmentType: "pickup", orderStatus: "confirmed", productionStatus: "not_required", fulfillmentStatus: "picked_up_by_customer" });
    expect(timeline.some((step) => step.key === "preparing" || step.key === "ready")).toBe(false);
    expect(timeline.find((step) => step.key === "pickup")?.state).toBe("current");
  });

  it("avoids refresh polling while the tab is hidden", () => {
    const refresh = readFileSync("src/features/orders/public-order-refresh.tsx", "utf8");
    expect(refresh).toContain('document.visibilityState === "visible"');
    expect(refresh).toContain("visibilitychange");
    expect(refresh).toContain("window.addEventListener(\"focus\"");
  });
});
