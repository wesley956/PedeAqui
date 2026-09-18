import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isOpenAt, nextOpening } from "@/server/menu/schedule";
import type { PublicHour } from "@/server/menu/schedule";

export type StoreOperationalLabel = "open" | "closed" | "paused";
export type StoreOperationalReason = "open" | "closed_hours" | "store_unavailable" | "orders_paused";

export type StoreOperationalStatus = {
  scheduleOpen: boolean;
  acceptingOrders: boolean;
  canOrder: boolean;
  label: StoreOperationalLabel;
  reason: StoreOperationalReason;
  timeZone: string;
  pauseReason: string | null;
  allowDelivery: boolean;
  allowPickup: boolean;
  nextOpening: ReturnType<typeof nextOpening>;
};

export function resolveStoreOperationalStatus(input: {
  storeStatus: string;
  acceptingOrders: boolean;
  pauseReason?: string | null;
  allowDelivery?: boolean;
  allowPickup?: boolean;
  hours: PublicHour[];
  timeZone: string;
  now?: Date;
}): StoreOperationalStatus {
  const now = input.now ?? new Date();
  const storeAvailable = input.storeStatus === "active";
  const scheduleOpen = storeAvailable && isOpenAt(input.hours, input.timeZone, now);
  const acceptingOrders = input.acceptingOrders;
  const canOrder = scheduleOpen && acceptingOrders;
  const reason: StoreOperationalReason = !storeAvailable
    ? "store_unavailable"
    : !acceptingOrders
      ? "orders_paused"
      : !scheduleOpen
        ? "closed_hours"
        : "open";
  const label: StoreOperationalLabel = reason === "open" ? "open" : reason === "orders_paused" ? "paused" : "closed";

  return {
    scheduleOpen,
    acceptingOrders,
    canOrder,
    label,
    reason,
    timeZone: input.timeZone,
    pauseReason: input.pauseReason?.trim() || null,
    allowDelivery: input.allowDelivery ?? true,
    allowPickup: input.allowPickup ?? true,
    nextOpening: reason === "closed_hours" ? nextOpening(input.hours, input.timeZone, now) : null,
  };
}

export function storeClosedOrderMessage(status: StoreOperationalStatus) {
  if (status.reason === "orders_paused") {
    const detail = status.pauseReason ? ` Motivo informado pela loja: ${status.pauseReason}.` : "";
    return `A loja está com os pedidos pausados no momento.${detail} Você ainda pode consultar um pedido existente ou falar com a equipe.`;
  }
  if (status.reason === "store_unavailable") {
    return "A loja não está aceitando novos pedidos no momento. Você ainda pode consultar um pedido existente ou falar com a equipe.";
  }
  if (status.reason === "closed_hours") {
    const reopening = status.nextOpening ? ` A próxima abertura está prevista para ${status.nextOpening.label}.` : "";
    return `A loja está fechada neste momento.${reopening} Você ainda pode consultar um pedido existente ou falar com a equipe.`;
  }
  return "A loja está aberta para pedidos.";
}

export function storeOperationalHoursMessage(status: StoreOperationalStatus) {
  if (status.reason === "open") return "A loja está aberta agora e aceitando pedidos.";
  if (status.reason === "orders_paused") {
    const detail = status.pauseReason ? ` Motivo informado pela loja: ${status.pauseReason}.` : "";
    return `A loja está dentro do horário, mas os pedidos estão pausados no momento.${detail}`;
  }
  if (status.reason === "store_unavailable") return "A loja está temporariamente indisponível para novos pedidos.";
  return status.nextOpening
    ? `A loja está fechada agora. A próxima abertura está prevista para ${status.nextOpening.label}.`
    : "A loja está fechada agora e não encontrei um próximo horário de abertura configurado.";
}

export class StoreOperationalStatusService {
  static async load(input: { organizationId: string; storeId: string; now?: Date }) {
    const admin = createAdminClient();
    const [storeResult, settingsResult, hoursResult] = await Promise.all([
      admin.from("stores")
        .select("status, timezone")
        .eq("organization_id", input.organizationId)
        .eq("id", input.storeId)
        .maybeSingle(),
      admin.from("store_menu_settings")
        .select("accepting_orders, pause_reason, allow_delivery, allow_pickup")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .maybeSingle(),
      admin.from("store_hours")
        .select("weekday, opens_at, closes_at, closes_next_day")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .eq("active", true)
        .order("weekday")
        .order("sort_order")
        .order("opens_at"),
    ]);
    if (storeResult.error) throw storeResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (hoursResult.error) throw hoursResult.error;
    if (!storeResult.data) throw new Error("Store not found");

    const settings = settingsResult.data;
    return resolveStoreOperationalStatus({
      storeStatus: storeResult.data.status,
      acceptingOrders: settings?.accepting_orders ?? true,
      pauseReason: settings?.pause_reason ?? null,
      allowDelivery: settings?.allow_delivery ?? true,
      allowPickup: settings?.allow_pickup ?? true,
      hours: (hoursResult.data ?? []) as PublicHour[],
      timeZone: storeResult.data.timezone || "America/Sao_Paulo",
      now: input.now,
    });
  }
}
