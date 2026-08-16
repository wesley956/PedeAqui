import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/server/observability/logger";

export class OrderNotificationContextService {
  static async capture(orderId: string, trackingAccessToken: string) {
    const admin = createAdminClient();
    const { error } = await admin.rpc("order_notification_store_context_internal", {
      p_order_id: orderId,
      p_tracking_access_token: trackingAccessToken,
    });
    if (error) {
      // O pedido já existe e não pode falhar por causa do canal de comunicação.
      // Não registrar o token nem a mensagem bruta do banco.
      logger.warn("order_notification_context_store_failed", {
        orderId,
        errorCode: error.code ?? "unknown",
      });
      return false;
    }
    return true;
  }
}
