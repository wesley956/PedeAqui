"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/catalog/money";
import { DeliveryService } from "@/server/delivery/delivery-service";

function optionalMoney(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? parseMoneyToCents(value) : null;
}

function integer(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Expected an integer");
  return parsed;
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error("Expected a number");
  return parsed;
}

function refresh() {
  revalidatePath("/configuracoes/entrega");
  revalidatePath("/m/[slug]", "page");
}

export async function saveDeliverySettingsAction(formData: FormData) {
  await DeliveryService.saveSettings({
    enabled: formData.get("enabled") === "on",
    feeMode: formData.get("feeMode") === "default" ? "default" : "neighborhood",
    defaultFeeCents: optionalMoney(formData.get("defaultFee")) ?? 0,
    freeDeliveryOverCents: optionalMoney(formData.get("freeDeliveryOver")),
    estimatedMinMinutes: integer(formData.get("estimatedMinMinutes"), 30),
    estimatedMaxMinutes: integer(formData.get("estimatedMaxMinutes"), 60),
    maxDistanceKm: optionalNumber(formData.get("maxDistanceKm")),
    requireNeighborhoodMatch: formData.get("requireNeighborhoodMatch") === "on",
  });
  refresh();
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
  refresh();
}

export async function toggleDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.setNeighborhoodActive(String(formData.get("neighborhoodId") ?? ""), formData.get("active") === "true");
  refresh();
}

export async function removeDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.removeNeighborhood(String(formData.get("neighborhoodId") ?? ""));
  refresh();
}
