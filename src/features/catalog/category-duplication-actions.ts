"use server";

import { revalidatePath } from "next/cache";
import { CategoryService } from "@/server/catalog/category-service";
import { logger } from "@/server/observability/logger";

export async function duplicateCategoryFormAction(formData: FormData) {
  try {
    const categoryId = String(formData.get("categoryId") ?? "");
    const includeProducts = formData.get("includeProducts") === "on";
    const result = await CategoryService.duplicate(categoryId, includeProducts);
    revalidatePath("/cardapio/categorias");
    revalidatePath("/cardapio/produtos");
    return {
      ok: true,
      message: includeProducts
        ? `Categoria duplicada em modo pausado com ${result.productCount} produto(s). Revise antes de ativar.`
        : "Categoria duplicada em modo pausado. Revise antes de ativar.",
    };
  } catch (error) {
    logger.error("catalog_mutation_failed", {
      operation: "duplicate_category",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "Não foi possível duplicar a categoria agora." };
  }
}
