import "server-only";

import { IfoodOrderLifecycleService } from "@/server/integrations/providers/ifood/ifood-order-lifecycle-service";
import { OrderService } from "@/server/orders/order-service";

export type RoutedLifecycleIntent =
  | "accept"
  | "accept_and_start"
  | "reject"
  | "cancel"
  | "start_production"
  | "mark_ready";

export type RoutedLifecycleResult = {
  external: boolean;
  message: string | null;
};

/**
 * Keeps native PedeAqui orders on the existing synchronous state machine while
 * external iFood orders only enqueue provider commands. This is the boundary
 * that prevents a panel click from falsely advancing an external canonical
 * order before iFood confirms it by event.
 */
export async function routeOrderManagerLifecycle(input: {
  orderId: string;
  intent: RoutedLifecycleIntent;
  reason?: string | null;
}): Promise<RoutedLifecycleResult> {
  switch (input.intent) {
    case "accept": {
      const external = await IfoodOrderLifecycleService.enqueueIfExternal({
        orderId: input.orderId,
        command: "confirm",
      });
      if (external) {
        return { external: true, message: "Confirmação enviada ao iFood. Aguardando retorno da plataforma." };
      }
      await OrderService.confirm(input.orderId);
      return { external: false, message: null };
    }
    case "accept_and_start": {
      const external = await IfoodOrderLifecycleService.enqueueIfExternal({
        orderId: input.orderId,
        command: "confirm",
      });
      if (external) {
        return {
          external: true,
          message: "Confirmação enviada ao iFood. O preparo será liberado após o evento de confirmação.",
        };
      }
      await OrderService.confirm(input.orderId);
      try {
        await OrderService.startProduction(input.orderId);
        return { external: false, message: null };
      } catch {
        return {
          external: false,
          message: "Pedido aceito. O preparo não iniciou automaticamente; use Iniciar produção.",
        };
      }
    }
    case "reject":
    case "cancel": {
      const external = await IfoodOrderLifecycleService.enqueueIfExternal({
        orderId: input.orderId,
        command: "request_cancellation",
        cancellationReason: input.reason,
      });
      if (external) {
        return { external: true, message: "Cancelamento solicitado ao iFood. Aguardando confirmação da plataforma." };
      }
      if (input.intent === "reject") await OrderService.reject(input.orderId, input.reason ?? "");
      else await OrderService.cancel(input.orderId, input.reason ?? "");
      return { external: false, message: null };
    }
    case "start_production": {
      const external = await IfoodOrderLifecycleService.enqueueIfExternal({
        orderId: input.orderId,
        command: "start_preparation",
      });
      if (external) {
        return { external: true, message: "Início do preparo enviado ao iFood. Aguardando sincronização." };
      }
      await OrderService.startProduction(input.orderId);
      return { external: false, message: null };
    }
    case "mark_ready": {
      const external = await IfoodOrderLifecycleService.enqueueIfExternal({
        orderId: input.orderId,
        command: "mark_ready",
      });
      if (external) {
        return { external: true, message: "Pedido pronto informado ao iFood. Aguardando sincronização." };
      }
      await OrderService.setProduction(input.orderId, "ready");
      return { external: false, message: null };
    }
  }
}
