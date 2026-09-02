"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { parseMoneyToCents } from "@/server/catalog/money";
import { CatalogImageService } from "@/server/catalog/catalog-image-service";
import { StoreMenuService } from "@/server/menu/store-menu-service";
import { PERMISSIONS } from "@/server/access/permissions";
import { getAccessContext } from "@/server/access/context";
import { ProductExperienceService } from "@/server/product-experience/product-experience-service";

function schedulePauseTelemetry(action:"pause"|"resume"){
  after(async()=>{
    try{
      const context=await getAccessContext();
      await ProductExperienceService.capture(context,{eventName:"px.operation.pause",source:"server",outcome:"success",metadata:{action}});
    }catch{
      // Pausing or resuming orders is already complete and must remain so.
    }
  });
}

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
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
  revalidatePath("/operacao");
  revalidatePath("/", "layout");
}

async function resolveStoreImage(
  fileValue: FormDataEntryValue | null,
  removeValue: FormDataEntryValue | null,
  currentUrl: string | null,
  purpose: "menu-logo" | "menu-cover",
) {
  const file = optionalFile(fileValue);
  if (file) {
    const uploaded = await CatalogImageService.upload(file, {
      permission: PERMISSIONS.STORES_MANAGE,
      purpose,
    });
    return uploaded.publicUrl;
  }
  return removeValue === "on" ? null : currentUrl;
}

export async function saveMenuSettingsAction(formData: FormData) {
  const minimum = formData.get("minimumOrder");
  const current = await StoreMenuService.getSettings();
  const [logoUrl, coverUrl] = await Promise.all([
    resolveStoreImage(formData.get("logoFile"), formData.get("removeLogo"), current.logo_url, "menu-logo"),
    resolveStoreImage(formData.get("coverFile"), formData.get("removeCover"), current.cover_url, "menu-cover"),
  ]);

  await StoreMenuService.saveSettings({
    primaryColor: String(formData.get("primaryColor") || "#FF6B00"),
    logoUrl,
    coverUrl,
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
  schedulePauseTelemetry("pause");
  revalidateMenu();
}

export async function resumeOrdersAction() {
  await StoreMenuService.setAcceptingOrders(true);
  schedulePauseTelemetry("resume");
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
