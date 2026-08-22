"use server";

import { revalidatePath } from "next/cache";
import { CategoryService } from "@/server/catalog/category-service";
import { ProductService } from "@/server/catalog/product-service";
import { ModifierService } from "@/server/catalog/modifier-service";
import {
  CatalogImageService,
  type CatalogImageUpload,
} from "@/server/catalog/catalog-image-service";
import { parseMoneyToCents } from "@/server/catalog/money";
import { productAvailabilitySchema } from "@/server/catalog/schemas";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";
import { logger } from "@/server/observability/logger";

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

async function uploadNewCatalogImage(
  value: FormDataEntryValue | null,
  purpose: "product" | "category",
  permission: PermissionKey = PERMISSIONS.PRODUCTS_CREATE,
): Promise<CatalogImageUpload | null> {
  const file = optionalFile(value);
  if (!file) return null;
  return CatalogImageService.upload(file, {
    permission,
    purpose,
  });
}

function categoryInput(formData: FormData, imageUrl: string | null) {
  return {
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    imageUrl,
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  };
}

function productInput(formData: FormData, imageUrl: string | null) {
  const promotional = formData.get("promotionalPrice");
  const cost = formData.get("cost");
  return {
    categoryId: optionalString(formData.get("categoryId")),
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    imageUrl,
    priceCents: parseMoneyToCents(formData.get("price")),
    promotionalPriceCents: typeof promotional === "string" && promotional.trim() ? parseMoneyToCents(promotional) : null,
    costCents: typeof cost === "string" && cost.trim() ? parseMoneyToCents(cost) : null,
    sku: optionalString(formData.get("sku")),
    barcode: optionalString(formData.get("barcode")),
    preparationTimeMinutes: integer(formData.get("preparationTimeMinutes")),
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
    availability: productAvailabilitySchema.parse(formData.get("availability") ?? "available"),
  };
}

function modifierGroupInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    minSelection: integer(formData.get("minSelection")),
    maxSelection: integer(formData.get("maxSelection"), 1),
    required: formData.get("required") === "on",
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  };
}

function modifierInput(formData: FormData) {
  return {
    modifierGroupId: String(formData.get("modifierGroupId") ?? ""),
    name: String(formData.get("name") ?? ""),
    priceCents: parseMoneyToCents(formData.get("price")),
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  };
}

async function rollbackCatalogImage(uploaded: CatalogImageUpload | null) {
  if (!uploaded) return;
  try {
    await CatalogImageService.remove(uploaded.path);
  } catch {
    // CatalogImageService already emits a technical rollback log. The original
    // mutation error must remain the one reported to the caller.
  }
}

const safeCatalogMessages = new Set([
  "A imagem deve ter no máximo 4 MB.",
  "Escolha uma imagem JPEG, PNG ou WebP.",
  "É necessário selecionar uma unidade para enviar imagens.",
  "Não foi possível enviar a imagem. Tente novamente.",
  "Não foi possível processar a imagem. Escolha outro arquivo.",
]);

function catalogActionMessage(error: unknown, fallback: string) {
  if (error instanceof Error && safeCatalogMessages.has(error.message)) return error.message;
  return fallback;
}

function logCatalogMutationFailure(operation: string, error: unknown) {
  logger.error("catalog_mutation_failed", {
    operation,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export async function createCategoryAction(formData: FormData) {
  let uploaded: CatalogImageUpload | null = null;
  try {
    uploaded = await uploadNewCatalogImage(formData.get("imageFile"), "category");
    await CategoryService.create(categoryInput(formData, uploaded?.publicUrl ?? null));
  } catch (error) {
    await rollbackCatalogImage(uploaded);
    throw error;
  }

  revalidatePath("/cardapio/categorias");
}

export async function updateCategoryFormAction(formData: FormData) {
  let uploaded: CatalogImageUpload | null = null;
  try {
    const categoryId = String(formData.get("categoryId") ?? "");
    const current = await CategoryService.get(categoryId);
    uploaded = await uploadNewCatalogImage(formData.get("imageFile"), "category", PERMISSIONS.PRODUCTS_EDIT);
    const imageUrl = uploaded?.publicUrl ?? (formData.get("removeImage") === "on" ? null : current.image_url);
    await CategoryService.update(categoryId, categoryInput(formData, imageUrl));
    revalidatePath("/cardapio/categorias");
    return { ok: true, message: "Categoria atualizada com sucesso." };
  } catch (error) {
    await rollbackCatalogImage(uploaded);
    logCatalogMutationFailure("update_category", error);
    return { ok: false, message: catalogActionMessage(error, "Não foi possível atualizar a categoria.") };
  }
}

export async function removeCategoryAction(formData: FormData) {
  try {
    await CategoryService.remove(String(formData.get("categoryId") ?? ""));
    revalidatePath("/cardapio/categorias");
    return { ok: true, message: "Categoria removida do catálogo." };
  } catch (error) {
    logCatalogMutationFailure("remove_category", error);
    return { ok: false, message: "Não foi possível remover a categoria. Produtos e histórico foram preservados." };
  }
}

export async function createCategoryFormAction(formData: FormData) {
  try {
    await createCategoryAction(formData);
    return { ok: true, message: "Categoria criada com sucesso." };
  } catch (error) {
    logCatalogMutationFailure("create_category", error);
    return {
      ok: false,
      message: catalogActionMessage(
        error,
        "Não foi possível criar a categoria. Seus dados foram mantidos; tente novamente.",
      ),
    };
  }
}

export async function createProductAction(formData: FormData) {
  let uploaded: CatalogImageUpload | null = null;
  try {
    uploaded = await uploadNewCatalogImage(formData.get("imageFile"), "product");
    await ProductService.create(productInput(formData, uploaded?.publicUrl ?? null));
  } catch (error) {
    await rollbackCatalogImage(uploaded);
    throw error;
  }

  revalidatePath("/cardapio/produtos");
}

export async function updateProductFormAction(formData: FormData) {
  let uploaded: CatalogImageUpload | null = null;
  try {
    const productId = String(formData.get("productId") ?? "");
    const current = await ProductService.get(productId);
    uploaded = await uploadNewCatalogImage(formData.get("imageFile"), "product", PERMISSIONS.PRODUCTS_EDIT);
    const imageUrl = uploaded?.publicUrl ?? (formData.get("removeImage") === "on" ? null : current.image_url);
    await ProductService.update(productId, productInput(formData, imageUrl));
    revalidatePath("/cardapio/produtos");
    revalidatePath(`/cardapio/produtos/${productId}`);
    return { ok: true, message: "Produto atualizado com sucesso." };
  } catch (error) {
    await rollbackCatalogImage(uploaded);
    logCatalogMutationFailure("update_product", error);
    return { ok: false, message: catalogActionMessage(error, "Não foi possível atualizar o produto.") };
  }
}

export async function removeProductAction(formData: FormData) {
  try {
    await ProductService.remove(String(formData.get("productId") ?? ""));
    revalidatePath("/cardapio/produtos");
    return { ok: true, message: "Produto removido do catálogo." };
  } catch (error) {
    logCatalogMutationFailure("remove_product", error);
    return { ok: false, message: "Não foi possível remover o produto. Pedidos e histórico foram preservados." };
  }
}

export async function createProductFormAction(formData: FormData) {
  try {
    await createProductAction(formData);
    return { ok: true, message: "Produto criado com sucesso." };
  } catch (error) {
    logCatalogMutationFailure("create_product", error);
    return {
      ok: false,
      message: catalogActionMessage(
        error,
        "Não foi possível salvar o produto. Seus dados foram mantidos; tente novamente.",
      ),
    };
  }
}

export async function setProductAvailabilityAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const availability = productAvailabilitySchema.parse(formData.get("availability"));
  await ProductService.setAvailability(productId, availability);
  revalidatePath("/cardapio/produtos");
}

export async function duplicateProductAction(formData: FormData) {
  await ProductService.duplicate(String(formData.get("productId") ?? ""));
  revalidatePath("/cardapio/produtos");
}

export async function createModifierGroupAction(formData: FormData) {
  await ModifierService.createGroup(modifierGroupInput(formData));
  revalidatePath("/cardapio/adicionais");
}

export async function createModifierGroupFormAction(formData: FormData) {
  try {
    await createModifierGroupAction(formData);
    return { ok: true, message: "Grupo criado com sucesso." };
  } catch (error) {
    logCatalogMutationFailure("create_modifier_group", error);
    return { ok: false, message: "Não foi possível criar o grupo. Confira mínimo, máximo e obrigatoriedade." };
  }
}

export async function updateModifierGroupFormAction(formData: FormData) {
  try {
    await ModifierService.updateGroup(String(formData.get("modifierGroupId") ?? ""), modifierGroupInput(formData));
    revalidatePath("/cardapio/adicionais");
    return { ok: true, message: "Grupo atualizado com sucesso." };
  } catch (error) {
    logCatalogMutationFailure("update_modifier_group", error);
    return { ok: false, message: "Não foi possível atualizar o grupo. Confira mínimo, máximo e obrigatoriedade." };
  }
}

export async function removeModifierGroupAction(formData: FormData) {
  try {
    await ModifierService.removeGroup(String(formData.get("modifierGroupId") ?? ""));
    revalidatePath("/cardapio/adicionais");
    return { ok: true, message: "Grupo removido do catálogo." };
  } catch (error) {
    logCatalogMutationFailure("remove_modifier_group", error);
    return { ok: false, message: "Não foi possível remover o grupo. Produtos e pedidos foram preservados." };
  }
}

export async function createModifierAction(formData: FormData) {
  await ModifierService.createModifier(modifierInput(formData));
  revalidatePath("/cardapio/adicionais");
}

export async function createModifierFormAction(formData: FormData) {
  try {
    await createModifierAction(formData);
    return { ok: true, message: "Adicional criado com sucesso." };
  } catch (error) {
    logCatalogMutationFailure("create_modifier", error);
    return { ok: false, message: "Não foi possível criar o adicional. Confira nome, grupo e preço." };
  }
}

export async function updateModifierFormAction(formData: FormData) {
  try {
    await ModifierService.updateModifier(String(formData.get("modifierId") ?? ""), modifierInput(formData));
    revalidatePath("/cardapio/adicionais");
    return { ok: true, message: "Adicional atualizado com sucesso." };
  } catch (error) {
    logCatalogMutationFailure("update_modifier", error);
    return { ok: false, message: "Não foi possível atualizar o adicional. Confira nome, grupo e preço." };
  }
}

export async function removeModifierAction(formData: FormData) {
  try {
    await ModifierService.removeModifier(String(formData.get("modifierId") ?? ""));
    revalidatePath("/cardapio/adicionais");
    return { ok: true, message: "Adicional removido do catálogo." };
  } catch (error) {
    logCatalogMutationFailure("remove_modifier", error);
    return { ok: false, message: "Não foi possível remover o adicional. Pedidos foram preservados." };
  }
}

export async function linkModifierGroupAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  try {
    await ModifierService.linkGroupToProduct(
      productId,
      String(formData.get("modifierGroupId") ?? ""),
      integer(formData.get("sortOrder")),
    );
    revalidatePath("/cardapio/produtos");
    revalidatePath(`/cardapio/produtos/${productId}`);
    return { ok: true, message: "Grupo vinculado ao produto." };
  } catch (error) {
    logCatalogMutationFailure("link_modifier_group", error);
    return { ok: false, message: "Não foi possível vincular o grupo a este produto." };
  }
}

export async function unlinkModifierGroupAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  try {
    await ModifierService.unlinkGroupFromProduct(productId, String(formData.get("modifierGroupId") ?? ""));
    revalidatePath("/cardapio/produtos");
    revalidatePath(`/cardapio/produtos/${productId}`);
    return { ok: true, message: "Grupo desvinculado do produto." };
  } catch (error) {
    logCatalogMutationFailure("unlink_modifier_group", error);
    return { ok: false, message: "Não foi possível desvincular o grupo deste produto." };
  }
}

export async function uploadCatalogImageAction(formData: FormData) {
  const file = optionalFile(formData.get("file"));
  if (!file) throw new Error("Escolha uma imagem para enviar.");
  return CatalogImageService.upload(file);
}
