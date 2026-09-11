"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/catalog/money";
import { PromotionService } from "@/server/promotions/promotion-service";

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function promotionPaths(productIds: string[] = []) {
  revalidatePath("/cardapio/promocoes");
  revalidatePath("/cardapio/produtos");
  revalidatePath("/m/[slug]", "page");
  revalidatePath("/m/[slug]/produto/[id]", "page");
  for (const productId of productIds) revalidatePath(`/cardapio/produtos/${productId}`);
  revalidatePath("/", "layout");
}

export async function savePromotionAction(formData: FormData) {
  try {
    const productIds = formData.getAll("productId").map(String).filter(Boolean);
    const items = productIds.map((productId) => ({
      productId,
      promotionalPriceCents: parseMoneyToCents(formData.get(`price_${productId}`)),
      weekdays: formData.getAll(`weekday_${productId}`).map(Number),
      startsOn: optionalString(formData.get(`startsOn_${productId}`)),
      endsOn: optionalString(formData.get(`endsOn_${productId}`)),
      startsAt: optionalString(formData.get(`startsAt_${productId}`)),
      endsAt: optionalString(formData.get(`endsAt_${productId}`)),
    }));

    await PromotionService.saveCampaign({
      campaignName: optionalString(formData.get("campaignName")),
      items,
      label: optionalString(formData.get("label")),
      active: formData.get("active") === "on",
    });
    promotionPaths(productIds);
    return { ok: true, message: "Promoção criada com programação individual para cada produto." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Não foi possível salvar a promoção." };
  }
}

export async function removePromotionAction(formData: FormData) {
  try {
    await PromotionService.removeCampaign(String(formData.get("promotionGroupId") ?? ""));
    promotionPaths();
    return { ok: true, message: "Promoção removida. Os preços normais continuam preservados." };
  } catch {
    return { ok: false, message: "Não foi possível remover a promoção." };
  }
}
