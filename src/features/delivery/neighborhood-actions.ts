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

function refreshSettings() {
  revalidatePath("/configuracoes/entrega");
  revalidatePath("/m/[slug]", "page");
}

export async function updateDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.updateNeighborhood(String(formData.get("neighborhoodId") ?? ""), {
    neighborhoodName: String(formData.get("neighborhoodName") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    feeCents: optionalMoney(formData.get("fee")) ?? 0,
    minimumOrderCents: optionalMoney(formData.get("minimumOrder")),
    additionalMinutes: integer(formData.get("additionalMinutes")),
  });
  refreshSettings();
}
