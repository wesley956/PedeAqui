"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/catalog/money";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { DeliveryService } from "@/server/delivery/delivery-service";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { DriverMobileAccessService } from "@/server/delivery/driver-mobile-access-service";

function optionalMoney(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? parseMoneyToCents(value) : null;
}
function integer(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Expected an integer");
  return parsed;
}
function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function optional(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}
function refreshSettings() {
  revalidatePath("/configuracoes/entrega");
  revalidatePath("/m/[slug]", "page");
}
function refreshOperations() {
  revalidatePath("/entregas");
  revalidatePath("/entregador");
  revalidatePath("/pedidos");
  revalidatePath("/configuracoes/entregadores");
}

export async function saveDeliverySettingsAction(formData: FormData) {
  await DeliveryService.saveSettings({
    enabled: formData.get("enabled") === "on",
    feeMode: formData.get("feeMode") === "default" ? "default" : "neighborhood",
    defaultFeeCents: optionalMoney(formData.get("defaultFee")) ?? 0,
    freeDeliveryOverCents: optionalMoney(formData.get("freeDeliveryOver")),
    estimatedMinMinutes: integer(formData.get("estimatedMinMinutes"), 30),
    estimatedMaxMinutes: integer(formData.get("estimatedMaxMinutes"), 60),
    requireNeighborhoodMatch: formData.get("requireNeighborhoodMatch") === "on",
  });
  refreshSettings();
}
export async function createDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.createNeighborhood({
    neighborhoodName: String(formData.get("neighborhoodName") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    feeCents: optionalMoney(formData.get("fee")) ?? 0,
    minimumOrderCents: optionalMoney(formData.get("minimumOrder")),
    additionalMinutes: integer(formData.get("additionalMinutes")),
    active: true,
  });
  refreshSettings();
}
export async function toggleDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.setNeighborhoodActive(String(formData.get("neighborhoodId") ?? ""), formData.get("active") === "true");
  refreshSettings();
}
export async function removeDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.removeNeighborhood(String(formData.get("neighborhoodId") ?? ""));
  refreshSettings();
}

export type DeliveryActionState = { ok: boolean; message: string | null; error: string | null };
export type DriverMobileAccessState = {
  ok: boolean;
  error: string | null;
  inviteUrl: string | null;
  expiresAt: string | null;
  phone: string | null;
  linked: boolean;
};

function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message : "Não foi possível concluir a operação de entrega.";
  const lower = raw.toLocaleLowerCase("pt-BR");
  const rules: Array<[string, string]> = [
    ["driver capacity reached", "O entregador atingiu a capacidade configurada."],
    ["driver is not available", "O entregador está fora de serviço ou inativo."],
    ["driver has active deliveries", "Finalize ou reatribua as entregas ativas antes de tirar este entregador de serviço."],
    ["reassignment reason required", "Informe o motivo da reatribuição."],
    ["production must be ready", "O pedido precisa estar pronto antes de iniciar a entrega."],
    ["order is not assignable", "Este pedido não está disponível para atribuição."],
    ["not assigned to current driver", "Esta entrega não está atribuída ao seu usuário."],
    ["telefone já está vinculado", "Este telefone já está vinculado a outro entregador."],
    ["cadastre o telefone", "Cadastre o telefone do entregador antes de liberar o acesso."],
  ];
  for (const [needle, message] of rules) if (lower.includes(needle)) return message;
  return raw;
}

export async function createDriverAction(_previous: DeliveryActionState, formData: FormData): Promise<DeliveryActionState> {
  try {
    await DeliveryOperationsService.createDriver({
      name: text(formData, "name"),
      phone: optional(formData, "phone"),
      maxActiveDeliveries: Number(text(formData, "maxActiveDeliveries") || "3"),
    });
    refreshOperations();
    return { ok: true, message: "Entregador cadastrado e disponível para receber entregas.", error: null };
  } catch (error) {
    return { ok: false, message: null, error: friendly(error) };
  }
}

export async function createDriverMobileAccessAction(_previous: DriverMobileAccessState, formData: FormData): Promise<DriverMobileAccessState> {
  try {
    const result = await DriverMobileAccessService.createInvitation({
      driverId: text(formData, "driverId"),
    });
    revalidatePath("/configuracoes/entregadores");
    return {
      ok: true,
      error: null,
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt,
      phone: result.phone,
      linked: result.linked,
    };
  } catch (error) {
    return { ok: false, error: friendly(error), inviteUrl: null, expiresAt: null, phone: null, linked: false };
  }
}

export async function updateDriverAction(_previous: DeliveryActionState, formData: FormData): Promise<DeliveryActionState> {
  try {
    await DeliveryOperationsService.updateDriver(text(formData, "driverId"), {
      name: text(formData, "name"),
      phone: optional(formData, "phone"),
      active: formData.get("active") === "on",
      onDuty: formData.get("onDuty") === "on",
      maxActiveDeliveries: Number(text(formData, "maxActiveDeliveries") || "3"),
    });
    refreshOperations();
    return { ok: true, message: "Entregador atualizado.", error: null };
  } catch (error) {
    return { ok: false, message: null, error: friendly(error) };
  }
}

export async function deliveryOperationAction(_previous: DeliveryActionState, formData: FormData): Promise<DeliveryActionState> {
  const intent = text(formData, "intent");
  try {
    if (intent === "waiting") {
      await DeliveryOperationsService.markWaiting(text(formData, "orderId"), text(formData, "idempotencyKey"));
      scheduleOrderWhatsAppNotifications("delivery.waiting");
      refreshOperations();
      return { ok: true, message: "Pedido enviado para a fila de entregas.", error: null };
    }
    if (intent === "assign") {
      await DeliveryOperationsService.assign(text(formData, "orderId"), text(formData, "driverId"), optional(formData, "reason"), text(formData, "idempotencyKey"));
      scheduleOrderWhatsAppNotifications("delivery.assigned");
      refreshOperations();
      return { ok: true, message: "Entregador atribuído.", error: null };
    }
    if (["picked_up", "out_for_delivery", "delivered"].includes(intent)) {
      await DeliveryOperationsService.advance(text(formData, "deliveryId"), intent as "picked_up" | "out_for_delivery" | "delivered", text(formData, "idempotencyKey"));
      scheduleOrderWhatsAppNotifications(`delivery.${intent}`);
      refreshOperations();
      return { ok: true, message: intent === "delivered" ? "Entrega concluída." : "Status da entrega atualizado.", error: null };
    }
    return { ok: false, message: null, error: "Ação de entrega inválida." };
  } catch (error) {
    return { ok: false, message: null, error: friendly(error) };
  }
}
