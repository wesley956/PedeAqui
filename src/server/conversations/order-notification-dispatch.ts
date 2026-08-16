import "server-only";

import { after } from "next/server";
import { runOrderWhatsAppNotificationWorker } from "@/server/conversations/order-notification-worker";
import { logger } from "@/server/observability/logger";

export function scheduleOrderWhatsAppNotifications(reason: string) {
  after(async () => {
    try {
      await runOrderWhatsAppNotificationWorker({ limit: 25 });
    } catch (error) {
      logger.warn("order_notification_dispatch_failed", {
        reason,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  });
}
