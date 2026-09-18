import "server-only";

import { after } from "next/server";
import { runOrderWhatsAppNotificationWorker } from "@/server/conversations/order-notification-worker";
import { logger } from "@/server/observability/logger";

export function scheduleOrderWhatsAppNotifications(reason: string, orderId?: string) {
  after(async () => {
    try {
      await runOrderWhatsAppNotificationWorker({ limit: 25, orderId });
    } catch (error) {
      logger.warn("order_notification_dispatch_failed", {
        reason,
        orderId: orderId ?? null,
        targeted: Boolean(orderId),
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  });
}
