"use server";

import { revalidatePath } from "next/cache";
import { ModifierPauseBlockedError, ModifierService, type ModifierPauseBlocker } from "@/server/catalog/modifier-service";
import { ProductService } from "@/server/catalog/product-service";
import { productAvailabilitySchema } from "@/server/catalog/schemas";
import { logger } from "@/server/observability/logger";

export type AvailabilityResult = {
  ok: boolean;
  message: string;
  /** Preenchido quando pausar o sabor deixaria produtos à venda sem escolhas suficientes. */
  blockers?: ModifierPauseBlocker[];
};

function refreshCatalog() {
  revalidatePath("/cardapio/disponibilidade");
  revalidatePath("/cardapio/produtos");
  revalidatePath("/cardapio/adicionais");
}

/**
 * Liga/desliga um sabor em todos os grupos onde ele aparece (mesmo nome).
 * Quando a pausa deixaria produtos sem opção, devolve quais são em vez de falhar,
 * e com `markBlockedProductsSoldOut` marca esses produtos como esgotados antes de pausar.
 */
export async function setFlavorAvailabilityAction(input: { modifierId: string; active: boolean; markBlockedProductsSoldOut?: boolean }): Promise<AvailabilityResult> {
  try {
    const updated = await ModifierService.setModifierActive(input.modifierId, input.active, "matching_name", { markBlockedProductsSoldOut: input.markBlockedProductsSoldOut === true });
    refreshCatalog();
    const count = updated?.length ?? 0;
    const groups = count === 1 ? "1 grupo" : `${count} grupos`;
    return { ok: true, message: input.active ? `Reativado em ${groups}.` : `Pausado em ${groups}.` };
  } catch (error) {
    if (error instanceof ModifierPauseBlockedError) return { ok: false, message: error.message, blockers: error.blockers };
    logger.warn("catalog.availability_mutation_failed", { operation: "set_flavor_availability", error: error instanceof Error ? error.message : String(error) });
    return { ok: false, message: "Não foi possível alterar o sabor agora. Tente novamente." };
  }
}

/** Disponível ⇄ Esgotado (ou Oculto) para um produto, chamado direto pela tela de disponibilidade. */
export async function setProductAvailabilityAction(input: { productId: string; availability: string }): Promise<AvailabilityResult> {
  try {
    const availability = productAvailabilitySchema.parse(input.availability);
    await ProductService.setAvailability(input.productId, availability);
    refreshCatalog();
    revalidatePath(`/cardapio/produtos/${input.productId}`);
    return { ok: true, message: availability === "available" ? "Produto à venda." : availability === "sold_out" ? "Produto marcado como esgotado." : "Produto ocultado do cardápio." };
  } catch (error) {
    logger.warn("catalog.availability_mutation_failed", { operation: "set_product_availability", error: error instanceof Error ? error.message : String(error) });
    return { ok: false, message: "Não foi possível alterar o produto agora. Tente novamente." };
  }
}
