import { describe, expect, it } from "vitest";
import {
  rawWorkflowStage,
  visibleWorkflowStage,
} from "@/server/conversations/order-workflow-visibility";

const customTwoStage = {
  orders_workflow_mode: "custom",
  orders_custom_workflow: {
    delivery: ["new", "finished"],
    pickup: ["new", "finished"],
    quickFinish: true,
  },
} as const;

describe("order workflow final stage consistency", () => {
  it("keeps delivered confirmed delivery out of finished until order is completed", () => {
    const order = {
      fulfillmentType: "delivery",
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "delivered",
    };

    expect(rawWorkflowStage(order)).toBe("delivering");
    expect(visibleWorkflowStage(order, customTwoStage)).toBe("new");
  });

  it("keeps picked-up confirmed pickup out of finished until order is completed", () => {
    const order = {
      fulfillmentType: "pickup",
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "picked_up_by_customer",
    };

    expect(rawWorkflowStage(order)).toBe("awaiting_pickup");
    expect(visibleWorkflowStage(order, customTwoStage)).toBe("new");
  });

  it("keeps served confirmed service order out of finished until order is completed", () => {
    const order = {
      fulfillmentType: "dine_in",
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "served",
    };

    expect(rawWorkflowStage(order)).toBe("ready");
    expect(visibleWorkflowStage(order, customTwoStage)).toBe("new");
  });

  it("moves the order to finished only after canonical completion", () => {
    const order = {
      fulfillmentType: "delivery",
      orderStatus: "completed",
      productionStatus: "ready",
      fulfillmentStatus: "delivered",
    };

    expect(rawWorkflowStage(order)).toBe("finished");
    expect(visibleWorkflowStage(order, customTwoStage)).toBe("finished");
  });
});
