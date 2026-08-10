"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/catalog/money";
import { StoreMenuService } from "@/server/menu/store-menu-service";

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Expected an integer");
  return parsed;
}

function revalidateMenu() {
  revalidatePath("/configuracoes/cardapio");
  revalidatePath("/configuracoes/horarios");
  revalidatePath("/m/[slug]", "page");
  revalidatePath("/m/[slug]/produto/[id]", "page");
}

export async function saveMenuSettingsAction(formData: FormData) {
  const minimum = formData.get("minimumOrder");
  await StoreMenuService.saveSettings({
    primaryColor: String(formData.get("primaryColor") || "#FF6B00"),
    logoUrl: optionalString(formData.get("logoUrl")),
    coverUrl: optionalString(formData.get("coverUrl")),
    showSearch: formData.get("showSearch") === "on",
    showCategories: formData.get("showCategories") === "on",
    showProductImages: formData.get("showProductImages") === "on",
    allowPickup: formData.get("allowPickup") === "on",
    allowDelivery: formData.get("allowDelivery") === "on",
    minimumOrderCents: typeof minimum === "string" && minimum.trim() ? parseMoneyToCents(minimum) : 0,
    active: formData.get("active") === "on",
  });
  revalidateMenu();
}

export async function pauseOrdersAction(formData: FormData) {
  await StoreMenuService.setAcceptingOrders(false, optionalString(formData.get("reason")));
  revalidateMenu();
}

export async function resumeOrdersAction() {
  await StoreMenuService.setAcceptingOrders(true);
  revalidateMenu();
}

export async function addStoreHourAction(formData: FormData) {
  await StoreMenuService.addHour({
    weekday: integer(formData.get("weekday")),
    opensAt: String(formData.get("opensAt") ?? ""),
    closesAt: String(formData.get("closesAt") ?? ""),
    closesNextDay: formData.get("closesNextDay") === "on",
    sortOrder: integer(formData.get("sortOrder")),
    active: true,
  });
  revalidateMenu();
}

export async function removeStoreHourAction(formData: FormData) {
  await StoreMenuService.removeHour(String(formData.get("hourId") ?? ""));
  revalidateMenu();
}
