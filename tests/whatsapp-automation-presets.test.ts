import { describe, expect, it } from "vitest";
import {
  normalizeWhatsAppAutomationPreset,
  resolveOrderNotificationSelection,
  type OrderNotificationSelection,
} from "@/server/conversations/order-notification-model";

const custom: OrderNotificationSelection = {
  notifyOrderReceived: false,
  notifyOrderConfirmed: true,
  notifyProductionPreparing: false,
  notifyPaymentPaid: true,
  notifyPickupReady: false,
  notifyPickupCompleted: true,
  notifyOutForDelivery: false,
  notifyDelivered: true,
};

describe("WhatsApp automation presets", () => {
  it("keeps existing and unknown rows in custom mode", () => {
    expect(normalizeWhatsAppAutomationPreset(undefined)).toBe("custom");
    expect(normalizeWhatsAppAutomationPreset("legacy")).toBe("custom");
    expect(normalizeWhatsAppAutomationPreset("custom")).toBe("custom");
  });

  it("uses a low-noise simple flow", () => {
    expect(resolveOrderNotificationSelection("simple", custom)).toEqual({
      notifyOrderReceived: true,
      notifyOrderConfirmed: false,
      notifyProductionPreparing: false,
      notifyPaymentPaid: false,
      notifyPickupReady: true,
      notifyPickupCompleted: false,
      notifyOutForDelivery: true,
      notifyDelivered: false,
    });
  });

  it("enables every supported lifecycle notification in complete mode", () => {
    expect(Object.values(resolveOrderNotificationSelection("complete", custom)).every(Boolean)).toBe(true);
  });

  it("preserves exact choices in custom mode", () => {
    expect(resolveOrderNotificationSelection("custom", custom)).toEqual(custom);
  });
});
