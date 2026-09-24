import { describe, expect, it } from "vitest";
import { resolveNotificationWorkflowVisibility } from "@/server/conversations/order-workflow-visibility";

const settings = { orders_workflow_mode: "standard", orders_custom_workflow: null };

describe("WPP-COST-01 visible checkpoint deduplication", () => {
  it("folds received and confirmed into the same atomic initial checkpoint", () => {
    const received = resolveNotificationWorkflowVisibility({
      type: "order_received",
      fulfillmentType: "delivery",
      settings,
    });
    const confirmed = resolveNotificationWorkflowVisibility({
      type: "order_confirmed",
      fulfillmentType: "delivery",
      settings,
    });

    expect(received).toMatchObject({ eligible: true, checkpoint: "new", stage: "new" });
    expect(confirmed).toMatchObject({ eligible: true, checkpoint: "new", stage: "new" });
  });

  it("keeps high-value checkpoints distinct", () => {
    expect(resolveNotificationWorkflowVisibility({ type: "production_preparing", fulfillmentType: "delivery", settings }).checkpoint).toBe("preparing");
    expect(resolveNotificationWorkflowVisibility({ type: "out_for_delivery", fulfillmentType: "delivery", settings }).checkpoint).toBe("delivering");
    expect(resolveNotificationWorkflowVisibility({ type: "order_canceled", fulfillmentType: "delivery", settings }).checkpoint).toBe("canceled");
    expect(resolveNotificationWorkflowVisibility({ type: "pickup_ready", fulfillmentType: "pickup", settings }).checkpoint).toBe("awaiting_pickup");
  });

  it("still rejects fulfillment-incompatible notifications", () => {
    expect(resolveNotificationWorkflowVisibility({ type: "pickup_ready", fulfillmentType: "delivery", settings }).eligible).toBe(false);
    expect(resolveNotificationWorkflowVisibility({ type: "out_for_delivery", fulfillmentType: "pickup", settings }).eligible).toBe(false);
  });
});
