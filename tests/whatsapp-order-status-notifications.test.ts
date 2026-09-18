import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveNotificationWorkflowVisibility,
  workflowEligibilityByNotification,
} from "@/server/conversations/order-workflow-visibility";
import { resolveWhatsAppAutomationCapabilities } from "@/server/conversations/whatsapp-automation-capability";
import type { OrderNotificationType } from "@/server/conversations/order-notification-template";
import type { ModuleAvailability } from "@/modules/module-access";

const root = process.cwd();
const migration = () => fs.readFileSync(
  path.join(root, "supabase/sql/210_whatsapp_order_status_notifications.sql"),
  "utf8",
);

const customWorkflow = {
  orders_workflow_mode: "custom",
  orders_custom_workflow: {
    delivery: ["new", "preparing", "ready", "delivering", "finished"],
    pickup: ["new", "preparing", "awaiting_pickup", "finished"],
    quickFinish: true,
  },
};

function moduleAvailability(
  moduleKey: "conversations" | "production" | "deliveries",
  available: boolean,
): ModuleAvailability {
  return {
    moduleKey,
    available,
    reason: available ? "available" : "disabled_by_store",
    missingDependencies: [],
  };
}

const preferences = {
  order_received: true,
  order_confirmed: true,
  production_preparing: true,
  payment_paid: false,
  pickup_ready: true,
  pickup_completed: true,
  out_for_delivery: true,
  delivered: true,
  order_canceled: true,
} satisfies Record<OrderNotificationType, boolean>;

function capabilities(deliveryOperationEnabled = true) {
  return resolveWhatsAppAutomationCapabilities({
    businessType: "restaurant",
    modules: {
      conversations: moduleAvailability("conversations", true),
      production: moduleAvailability("production", false),
      deliveries: moduleAvailability("deliveries", false),
    },
    channel: { configured: true, enabled: true, connectionStatus: "connected" },
    orderNotificationsEnabled: true,
    preferences,
    onlinePaymentReady: false,
    deliveryOperationEnabled,
    workflowEligibility: workflowEligibilityByNotification(customWorkflow),
  });
}

describe("canonical WhatsApp order status notifications", () => {
  it("keeps received and confirmed visible at the same order stage but on distinct checkpoints", () => {
    const received = resolveNotificationWorkflowVisibility({
      type: "order_received",
      fulfillmentType: "delivery",
      settings: customWorkflow,
    });
    const confirmed = resolveNotificationWorkflowVisibility({
      type: "order_confirmed",
      fulfillmentType: "delivery",
      settings: customWorkflow,
    });

    expect(received).toMatchObject({ eligible: true, stage: "new", checkpoint: "received" });
    expect(confirmed).toMatchObject({ eligible: true, stage: "new", checkpoint: "confirmed" });
  });

  it("accepts the custom pickup awaiting_pickup stage as the customer-visible ready checkpoint", () => {
    expect(resolveNotificationWorkflowVisibility({
      type: "pickup_ready",
      fulfillmentType: "pickup",
      settings: customWorkflow,
    })).toMatchObject({ eligible: true, checkpoint: "awaiting_pickup" });
  });

  it("does not let optional production/delivery UI modules suppress authoritative status notices", () => {
    const result = capabilities(true);
    expect(result.production_preparing.state).toBe("enabled");
    expect(result.pickup_ready.state).toBe("enabled");
    expect(result.out_for_delivery.state).toBe("enabled");
    expect(result.delivered.state).toBe("enabled");
  });

  it("still blocks delivery notifications when delivery operation itself is disabled", () => {
    const result = capabilities(false);
    expect(result.out_for_delivery.state).toBe("suspended_module");
    expect(result.delivered.state).toBe("suspended_module");
  });

  it("maps every customer-visible step from an authoritative domain event", () => {
    const sql = migration();
    const mappings = [
      ["order.created", "order_received"],
      ["order.confirmed", "order_confirmed"],
      ["production.preparing", "production_preparing"],
      ["payment.paid", "payment_paid"],
      ["production.ready", "pickup_ready"],
      ["fulfillment.picked_up_by_customer", "pickup_completed"],
      ["fulfillment.out_for_delivery", "out_for_delivery"],
      ["fulfillment.delivered", "delivered"],
      ["order.canceled", "order_canceled"],
    ] as const;

    for (const [event, type] of mappings) {
      expect(sql).toContain(`when '${event}' then '${type}'`);
    }
    expect(sql).not.toContain("when 'production.canceled' then 'order_canceled'");
    expect(sql).not.toContain("when 'fulfillment.canceled' then 'order_canceled'");
  });

  it("preserves external-order exclusion, pickup scoping and no-backfill semantics", () => {
    const sql = migration();
    expect(sql).toContain("from public.external_orders eo");
    expect(sql).toContain("v_type in ('pickup_ready', 'pickup_completed')");
    expect(sql).toContain("v_fulfillment_type is distinct from 'pickup'");
    expect(sql).not.toMatch(/insert\s+into\s+public\.order_whatsapp_notifications[\s\S]*select[\s\S]*from\s+public\.domain_events/i);
  });

  it("extends checkpoint validation without removing historical checkpoint values", () => {
    const sql = migration();
    for (const checkpoint of [
      "new", "received", "confirmed", "preparing", "ready", "delivering",
      "awaiting_pickup", "finished", "payment", "canceled",
    ]) {
      expect(sql).toContain(`'${checkpoint}'`);
    }
  });
});
