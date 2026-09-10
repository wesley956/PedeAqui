"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/catalog/money";
import { PromotionService } from "@/server/promotions/promotion-service";

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function promotionPaths(productId?: string) {
  revalidatePath("/cardapio/promocoes");
  revalidatePath("/cardapio/produtos");
  revalidatePath("/m/[slug]", "page");
  revalidatePath("/m/[slug]/produto/[id]", "page");
  if (productId) revalidatePath(`/cardapio/produtos/${productId}`);
  revalidatePath("/", "layout");
}

export async function savePromotionAction(formData: FormData) {
  try {
    const productId = String(formData.get("productId") ?? "");
    const weekdays = formData.getAll("weekday").map(Number);
    await PromotionService.save({
      productId,
      promotionalPriceCents: parseMoneyToCents(formData.get("promotionalPrice")),
      weekdays,
      startsOn: optionalString(formData.get("startsOn")),
      endsOn: optionalString(formData.get("endsOn")),
      startsAt: optionalString(formData.get("startsAt")),
      endsAt: optionalString(formData.get("endsAt")),
      label: optionalString(formData.get("label")),
      active: formData.get("active") === "on",
    });
    promotionPaths(productId);
    return { ok: true, message: "Promoção salva e programada com sucesso." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Não foi possível salvar a promoção." };
  }
}

export async function removePromotionAction(formData: FormData) {
  try {
    await PromotionService.remove(String(formData.get("promotionId") ?? ""));
    promotionPaths();
    return { ok: true, message: "Promoção removida. O preço normal continua preservado." };
  } catch {
    return { ok: false, message: "Não foi possível remover a promoção." };
  }
}
