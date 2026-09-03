import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ModuleAvailability } from "@/modules/module-access";
import type { ModuleKey } from "@/modules/module-catalog";
import {
  automationCanDispatch,
  resolveWhatsAppAutomationCapabilities,
  type WhatsAppAutomationCapabilityInput,
} from "@/server/conversations/whatsapp-automation-capability";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

function availability(moduleKey: ModuleKey, available = true, reason: ModuleAvailability["reason"] = "available"): ModuleAvailability {
  return { moduleKey, available, reason, missingDependencies: [] };
}

const preferences = {
  order_received: true,
  order_confirmed: true,
  production_preparing: true,
  payment_paid: true,
  pickup_ready: true,
  pickup_completed: true,
  out_for_delivery: true,
  delivered: true,
} as const;

function input(overrides: Partial<WhatsAppAutomationCapabilityInput> = {}): WhatsAppAutomationCapabilityInput {
  return {
    businessType: "restaurant",
    modules: {
      conversations: availability("conversations"),
      production: availability("production"),
      deliveries: availability("deliveries"),
    },
    channel: { configured: true, enabled: true, connectionStatus: "connected" },
    orderNotificationsEnabled: true,
    preferences,
    onlinePaymentReady: true,
    deliveryOperationEnabled: true,
    ...overrides,
  };
}

describe("#434 WhatsApp automation capability matrix", () => {
  it("enables eligible delivery automations only when the effective capability exists", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input());
    expect(capabilities.out_for_delivery.state).toBe("enabled");
    expect(capabilities.delivered.state).toBe("enabled");
    expect(automationCanDispatch(capabilities.out_for_delivery)).toBe(true);
  });

  it("suspends delivery automations without deleting the saved preference", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({
      modules: {
        conversations: availability("conversations"),
        production: availability("production"),
        deliveries: availability("deliveries", false, "disabled_by_store"),
      },
    }));
    expect(capabilities.out_for_delivery).toMatchObject({
      state: "suspended_module",
      preferenceEnabled: true,
      configurable: false,
    });
    expect(capabilities.delivered.state).toBe("suspended_module");
  });

  it("distinguishes entitlement suspension from a module toggle", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({
      modules: {
        conversations: availability("conversations"),
        production: availability("production", false, "not_in_plan"),
        deliveries: availability("deliveries"),
      },
    }));
    expect(capabilities.production_preparing.state).toBe("suspended_entitlement");
    expect(capabilities.pickup_ready.state).toBe("suspended_entitlement");
  });

  it("keeps PIX/payment-online independent from operational WhatsApp", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({ onlinePaymentReady: false }));
    expect(capabilities.payment_paid.state).toBe("invalid_configuration");
    expect(capabilities.payment_paid.reason).toContain("Dinheiro e cartões presenciais continuam independentes");
    expect(capabilities.order_received.state).toBe("enabled");
    expect(capabilities.production_preparing.state).toBe("enabled");
    expect(capabilities.out_for_delivery.state).toBe("enabled");
  });

  it("suspends delivery notifications when the store delivery operation is off even if the module remains on", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({ deliveryOperationEnabled: false }));
    expect(capabilities.out_for_delivery.state).toBe("suspended_module");
    expect(capabilities.delivered.state).toBe("suspended_module");
    expect(capabilities.order_received.state).toBe("enabled");
  });

  it("suspends active preferences when the channel disconnects but keeps them configurable", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({
      channel: { configured: true, enabled: true, connectionStatus: "action_required" },
    }));
    expect(capabilities.order_received).toMatchObject({
      state: "suspended_channel",
      preferenceEnabled: true,
      configurable: true,
    });
  });

  it("does not call a disabled preference suspended just because the channel is down", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({
      channel: { configured: true, enabled: true, connectionStatus: "action_required" },
      preferences: { ...preferences, order_received: false },
    }));
    expect(capabilities.order_received.state).toBe("available_disabled");
  });

  it("restores an existing preference when a capability returns without generating a different configuration", () => {
    const suspended = resolveWhatsAppAutomationCapabilities(input({
      modules: {
        conversations: availability("conversations"),
        production: availability("production"),
        deliveries: availability("deliveries", false, "disabled_by_store"),
      },
    }));
    const restored = resolveWhatsAppAutomationCapabilities(input());
    expect(suspended.out_for_delivery.preferenceEnabled).toBe(true);
    expect(restored.out_for_delivery.preferenceEnabled).toBe(true);
    expect(restored.out_for_delivery.state).toBe("enabled");
  });

  it("uses profile-aware vocabulary without changing the internal event key", () => {
    const capabilities = resolveWhatsAppAutomationCapabilities(input({ businessType: "gas" }));
    expect(capabilities.production_preparing.key).toBe("production_preparing");
    expect(capabilities.production_preparing.label).toBe("Em separação");
  });
});

describe("#434 shared UI/dispatch contracts", () => {
  const worker = read("src/server/conversations/order-notification-worker.ts");
  const page = read("src/app/(app)/configuracoes/conversas/page.tsx");
  const action = read("src/features/conversations/settings-actions.ts");

  it("uses the same capability resolver in the settings UI and background dispatch", () => {
    expect(page).toContain("resolveWhatsAppAutomationCapabilities");
    expect(worker).toContain("resolveWhatsAppAutomationCapabilities");
    expect(worker).toContain("WhatsAppAutomationCapabilityService.loadForStore");
    expect(worker).not.toContain('.from("store_modules")');
  });

  it("revalidates payment, module entitlement, delivery operation and channel before sending", () => {
    expect(worker).toContain("structural.onlinePaymentReady");
    expect(worker).toContain("structural.deliveryOperationEnabled");
    expect(worker).toContain("structural.modules");
    expect(worker).toContain("settings.connection_status");
    expect(worker).toContain("automationCanDispatch(capability)");
  });

  it("makes structural suspension terminal so reactivation does not replay old queued events", () => {
    expect(worker).toContain('status: "skipped"');
    expect(worker).toContain('case "suspended_module": return "automation_suspended_module"');
    expect(worker).toContain('case "suspended_entitlement": return "automation_suspended_entitlement"');
    expect(worker).toContain('case "invalid_configuration": return "automation_invalid_configuration"');
  });

  it("keeps temporary Meta unavailability retryable instead of losing a transient notification", () => {
    expect(worker).toContain('settings.connection_status === "temporarily_unavailable"');
    expect(worker).toContain('errorCode: "whatsapp_temporarily_unavailable"');
    expect(worker).toContain("retryDelaySeconds(job.attempts)");
  });

  it("preserves disabled structural preferences on save", () => {
    expect(action).toContain("capabilities.production_preparing.configurable");
    expect(action).toContain("currentPreferences.production_preparing");
    expect(action).toContain("capabilities.payment_paid.configurable");
    expect(action).toContain("currentPreferences.payment_paid");
    expect(action).toContain("capabilities.out_for_delivery.configurable");
    expect(action).toContain("currentPreferences.out_for_delivery");
  });
});
