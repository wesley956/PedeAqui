import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultCustomWorkflowConfig } from "@/features/orders/workflow-config";
import { buildOrderLookupMessage } from "@/server/conversations/bot-menu";
import { resolveWhatsAppAutomationCapabilities } from "@/server/conversations/whatsapp-automation-capability";
import type { ModuleAvailability } from "@/modules/module-access";
import type { ModuleKey } from "@/modules/module-catalog";
import {
  rawWorkflowStage,
  resolveNotificationWorkflowVisibility,
  visibleWorkflowStage,
  visibleWorkflowStages,
  workflowEligibilityByNotification,
} from "@/server/conversations/order-workflow-visibility";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const standard = { orders_workflow_mode: "standard", orders_custom_workflow: null };
const simplified = { orders_workflow_mode: "simplified", orders_custom_workflow: null };
const custom = (delivery: string[], pickup: string[], quickFinish = false) => ({
  orders_workflow_mode: "custom",
  orders_custom_workflow: { delivery, pickup, quickFinish },
});

describe("#1017 effective customer-visible workflow", () => {
  it("keeps every canonical stage in the standard workflow", () => {
    expect(visibleWorkflowStages({ mode: "standard", custom: defaultCustomWorkflowConfig, fulfillmentType: "delivery" }))
      .toEqual(["new", "preparing", "ready", "delivering", "finished"]);
    expect(visibleWorkflowStages({ mode: "standard", custom: defaultCustomWorkflowConfig, fulfillmentType: "pickup" }))
      .toEqual(["new", "preparing", "ready", "awaiting_pickup", "finished"]);
  });

  it("folds the simplified flow without dropping meaningful delivery dispatch", () => {
    expect(visibleWorkflowStages({ mode: "simplified", custom: defaultCustomWorkflowConfig, fulfillmentType: "delivery" }))
      .toEqual(["new", "ready", "delivering", "finished"]);
    expect(visibleWorkflowStages({ mode: "simplified", custom: defaultCustomWorkflowConfig, fulfillmentType: "pickup" }))
      .toEqual(["new", "ready", "finished"]);
    expect(resolveNotificationWorkflowVisibility({ type: "production_preparing", fulfillmentType: "delivery", settings: simplified }).eligible).toBe(false);
    expect(resolveNotificationWorkflowVisibility({ type: "out_for_delivery", fulfillmentType: "delivery", settings: simplified }).eligible).toBe(true);
    expect(resolveNotificationWorkflowVisibility({ type: "pickup_completed", fulfillmentType: "pickup", settings: simplified }).eligible).toBe(true);
  });

  it("honors custom delivery and pickup stages independently", () => {
    const settings = custom(
      ["new", "ready", "delivering", "finished"],
      ["new", "preparing", "awaiting_pickup", "finished"],
    );
    expect(resolveNotificationWorkflowVisibility({ type: "production_preparing", fulfillmentType: "delivery", settings }).eligible).toBe(false);
    expect(resolveNotificationWorkflowVisibility({ type: "production_preparing", fulfillmentType: "pickup", settings }).eligible).toBe(true);
    expect(resolveNotificationWorkflowVisibility({ type: "pickup_ready", fulfillmentType: "pickup", settings }).eligible).toBe(false);
    expect(resolveNotificationWorkflowVisibility({ type: "out_for_delivery", fulfillmentType: "delivery", settings }).eligible).toBe(true);
  });

  it("only communicates the endpoints in a quick-finish new-to-finished flow", () => {
    const settings = custom(["new", "finished"], ["new", "finished"], true);
    const eligibility = workflowEligibilityByNotification(settings);
    expect(eligibility).toMatchObject({
      order_received: true,
      order_confirmed: true,
      production_preparing: false,
      pickup_ready: false,
      out_for_delivery: false,
      pickup_completed: true,
      delivered: true,
      payment_paid: true,
      order_canceled: true,
    });
  });

  it("keeps payment and cancellation outside normal workflow lanes", () => {
    const settings = custom(["new", "finished"], ["new", "finished"]);
    expect(resolveNotificationWorkflowVisibility({ type: "payment_paid", fulfillmentType: "delivery", settings }))
      .toMatchObject({ eligible: true, checkpoint: "payment" });
    expect(resolveNotificationWorkflowVisibility({ type: "order_canceled", fulfillmentType: "pickup", settings }))
      .toMatchObject({ eligible: true, checkpoint: "canceled" });
  });

  it("never enables a notification for the wrong fulfillment type", () => {
    expect(resolveNotificationWorkflowVisibility({ type: "out_for_delivery", fulfillmentType: "pickup", settings: standard }).eligible).toBe(false);
    expect(resolveNotificationWorkflowVisibility({ type: "pickup_ready", fulfillmentType: "delivery", settings: standard }).eligible).toBe(false);
  });

  it("uses the active store workflow for an already-open order without rewriting its state", () => {
    const order = {
      fulfillmentType: "delivery",
      orderStatus: "confirmed",
      productionStatus: "preparing",
      fulfillmentStatus: "pending",
    };
    expect(rawWorkflowStage(order)).toBe("preparing");
    expect(visibleWorkflowStage(order, standard)).toBe("preparing");
    expect(visibleWorkflowStage(order, simplified)).toBe("new");
    expect(order.productionStatus).toBe("preparing");
  });

  it("answers order tracking with the resolved visible stage instead of leaking hidden internals", () => {
    const message = buildOrderLookupMessage({
      displayNumber: 42,
      orderStatus: "confirmed",
      productionStatus: "preparing",
      fulfillmentStatus: "pending",
      visibleStage: "new",
      trackingUrl: "https://pedeaqui.example/acesso",
    });
    expect(message).toContain("Etapa atual: Novo");
    expect(message).not.toContain("Preparo:");
    expect(message).not.toContain("em preparo");
  });
});

describe("#1017 shared dispatch and persistence contracts", () => {
  const worker = read("src/server/conversations/order-notification-worker.ts");
  const greeting = read("src/server/conversations/greeting-service.ts");
  const page = read("src/app/(app)/configuracoes/conversas/page.tsx");
  const migration = read("supabase/sql/209_whatsapp_order_workflow_sync.sql");

  it("uses the same visibility resolver in notifications and bot tracking", () => {
    expect(worker).toContain("resolveNotificationWorkflowVisibility");
    expect(worker).toContain('errorCode: "workflow_stage_hidden"');
    expect(greeting).toContain("visibleWorkflowStage");
    expect(greeting).toContain("orders_workflow_mode, orders_custom_workflow");
  });

  it("claims a visible checkpoint atomically before dispatch", () => {
    expect(worker).toContain("order_notification_claim_workflow_checkpoint_internal");
    expect(worker).toContain('errorCode: "workflow_checkpoint_duplicate"');
    expect(migration).toContain("order_whatsapp_notifications_visible_checkpoint_uniq");
    expect(migration).toContain("when unique_violation");
    expect(migration).toContain("locked_by = trim(p_worker_id)");
    expect(migration).toContain("grant execute on function public.order_notification_claim_workflow_checkpoint_internal(uuid,text,text)\n  to service_role");
  });

  it("shows the restaurant that WhatsApp follows the order workflow", () => {
    expect(page).toContain("Sincronizado com o fluxo de pedidos ✓");
    expect(page).toContain("As preferências ficam guardadas");
  });

  it("keeps a hidden-stage preference stored but unavailable to presets", () => {
    const available = (moduleKey: ModuleKey): ModuleAvailability => ({ moduleKey, available: true, reason: "available", missingDependencies: [] });
    const eligibility = workflowEligibilityByNotification(custom(["new", "finished"], ["new", "finished"], true));
    const capabilities = resolveWhatsAppAutomationCapabilities({
      businessType: "restaurant",
      modules: {
        conversations: available("conversations"),
        production: available("production"),
        deliveries: available("deliveries"),
      },
      channel: { configured: true, enabled: true, connectionStatus: "connected" },
      orderNotificationsEnabled: true,
      preferences: {
        order_received: true,
        order_confirmed: true,
        production_preparing: true,
        payment_paid: true,
        pickup_ready: true,
        pickup_completed: true,
        out_for_delivery: true,
        delivered: true,
        order_canceled: true,
      },
      onlinePaymentReady: true,
      deliveryOperationEnabled: true,
      workflowEligibility: eligibility,
    });
    expect(capabilities.production_preparing).toMatchObject({
      state: "unavailable_workflow",
      preferenceEnabled: true,
      configurable: false,
    });
    expect(capabilities.out_for_delivery.state).toBe("unavailable_workflow");
    expect(capabilities.delivered.state).toBe("enabled");
  });
});
