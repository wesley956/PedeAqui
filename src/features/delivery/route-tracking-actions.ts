"use server";

import { revalidatePath } from "next/cache";
import { RouteTrackingService } from "@/server/delivery/route-tracking-service";

export type RouteTrackingStartState = {
  ok: boolean;
  message: string | null;
  error: string | null;
};

function trackingError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLocaleLowerCase("pt-BR");
  if (lower.includes("tracking is disabled")) return "O rastreamento desta unidade está desativado.";
  if (lower.includes("not assigned") || lower.includes("current driver")) return "Esta entrega não está atribuída ao seu acesso.";
  if (lower.includes("out for delivery")) return "Primeiro confirme que o pedido saiu para entrega.";
  return "Não foi possível ativar o rastreamento agora. Confira sua conexão e tente novamente.";
}

export async function startDriverRouteTrackingAction(
  _previous: RouteTrackingStartState,
  formData: FormData,
): Promise<RouteTrackingStartState> {
  const deliveryId = String(formData.get("deliveryId") ?? "").trim();
  try {
    await RouteTrackingService.startForDelivery(deliveryId);
    revalidatePath("/entregador");
    return { ok: true, message: "Rastreamento da rota ativado. Agora compartilhe a localização do celular.", error: null };
  } catch (error) {
    revalidatePath("/entregador");
    return { ok: false, message: null, error: trackingError(error) };
  }
}

export async function sendRouteHeartbeat(input: {
  routeSessionId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  capturedAt: string;
  sampleKey: string;
  permission: "granted" | "denied" | "unavailable";
}) {
  return RouteTrackingService.heartbeat(input);
}
