import { describe, expect, it } from "vitest";
import {
  createOrderNotificationOperationalCounters,
  recordOrderNotificationOperationalOutcome,
} from "@/server/conversations/order-notification-cost-observability";

describe("WPP-COST-01 notification cost observability", () => {
  it("separates freeform, template and idempotent existing sends", () => {
    const counters = createOrderNotificationOperationalCounters();
    counters.claimed = 3;

    recordOrderNotificationOperationalOutcome(counters, { status: "sent", dispatchMode: "freeform" });
    recordOrderNotificationOperationalOutcome(counters, { status: "sent", dispatchMode: "template" });
    recordOrderNotificationOperationalOutcome(counters, { status: "sent", dispatchMode: "existing" });

    expect(counters).toMatchObject({
      claimed: 3,
      sent: 3,
      sent_freeform: 1,
      sent_template: 1,
      sent_existing: 1,
      failed: 0,
      skipped: 0,
      suppressed: 0,
    });
  });

  it("counts skipped notifications as suppressions by explicit reason", () => {
    const counters = createOrderNotificationOperationalCounters();

    recordOrderNotificationOperationalOutcome(counters, {
      status: "skipped",
      reasonCode: "workflow_checkpoint_duplicate",
    });
    recordOrderNotificationOperationalOutcome(counters, {
      status: "skipped",
      reasonCode: "template_required",
    });
    recordOrderNotificationOperationalOutcome(counters, {
      status: "skipped",
      reasonCode: "workflow_checkpoint_duplicate",
    });

    expect(counters.skipped).toBe(3);
    expect(counters.suppressed).toBe(3);
    expect(counters.suppressed_workflow_checkpoint_duplicate).toBe(2);
    expect(counters.suppressed_template_required).toBe(1);
  });

  it("keeps failures separate from suppressions", () => {
    const counters = createOrderNotificationOperationalCounters();

    recordOrderNotificationOperationalOutcome(counters, {
      status: "failed",
      reasonCode: "provider_http_500",
    });

    expect(counters.failed).toBe(1);
    expect(counters.suppressed).toBe(0);
    expect(counters.skipped).toBe(0);
  });
});
