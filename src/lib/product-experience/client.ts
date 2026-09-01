"use client";

import type {
  ProductExperienceEventName,
  ProductExperienceOutcome,
} from "@/server/product-experience/contracts";

const SESSION_KEY = "pedeaqui_product_session";

function sessionId() {
  try {
    const current = window.sessionStorage.getItem(SESSION_KEY);
    if (current) return current;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export function trackProductExperience(input: {
  eventName: ProductExperienceEventName;
  orderId?: string | null;
  outcome?: ProductExperienceOutcome | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const body = JSON.stringify({
    ...input,
    sessionId: sessionId(),
    occurredAt: new Date().toISOString(),
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/product-experience/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/product-experience/events", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Telemetry is deliberately invisible to the operation.
  }
}
