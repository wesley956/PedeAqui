import "server-only";

import { after } from "next/server";
import { logger } from "@/server/observability/logger";
import { OrderPixService } from "@/server/payments/order-pix-service";

/**
 * Starts the first online Pix charge attempt after the authoritative order has
 * already been committed. The operation is intentionally best-effort: a PSP
 * outage must never roll back or duplicate the order. OrderPixService owns the
 * idempotency guarantee, and the public order page remains a safe retry path.
 */
export function scheduleOrderPixCharge(orderId: string) {
  after(async () => {
    try {
      await OrderPixService.ensureForOrder(orderId);
    } catch (error) {
      logger.warn("order_pix_initial_charge_failed", {
        orderId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  });
}
