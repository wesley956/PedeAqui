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
import { PERMISSIONS } from "@/server/access/permissions";
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
): Promise<CatalogImageUpload | null> {
  const file = optionalFile(value);
  if (!file) return null;
  return CatalogImageService.upload(file, {
    permission: PERMISSIONS.PRODUCTS_CREATE,
    purpose,
  });
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
  const input = {
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  };

  let uploaded: CatalogImageUpload | null = null;
  try {
    uploaded = await uploadNewCatalogImage(formData.get("imageFile"), "category");
    await CategoryService.create({
      ...input,
      imageUrl: uploaded?.publicUrl ?? null,
    });
  } catch (error) {
    await rollbackCatalogImage(uploaded);
    throw error;
  }

  revalidatePath("/cardapio/categorias");
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
  const promotional = formData.get("promotionalPrice");
  const cost = formData.get("cost");
  const input = {
    categoryId: optionalString(formData.get("categoryId")),
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    priceCents: parseMoneyToCents(formData.get("price")),
    promotionalPriceCents: typeof promotional === "string" && promotional.trim() ? parseMoneyToCents(promotional) : null,
    costCents: typeof cost === "string" && cost.trim() ? parseMoneyToCents(cost) : null,
    sku: optionalString(formData.get("sku")),
    barcode: optionalString(formData.get("barcode")),
    preparationTimeMinutes: integer(formData.get("preparationTimeMinutes")),
    active: formData.get("active") === "on",
    availability: productAvailabilitySchema.parse(formData.get("availability") ?? "available"),
  };

  let uploaded: CatalogImageUpload | null = null;
  try {
    uploaded = await uploadNewCatalogImage(formData.get("imageFile"), "product");
    await ProductService.create({
      ...input,
      imageUrl: uploaded?.publicUrl ?? null,
    });
  } catch (error) {
    await rollbackCatalogImage(uploaded);
    throw error;
  }

  revalidatePath("/cardapio/produtos");
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
  await ModifierService.createGroup({
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    minSelection: integer(formData.get("minSelection")),
    maxSelection: integer(formData.get("maxSelection"), 1),
    required: formData.get("required") === "on",
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  });
  revalidatePath("/cardapio/adicionais");
}

export async function createModifierAction(formData: FormData) {
  await ModifierService.createModifier({
    modifierGroupId: String(formData.get("modifierGroupId") ?? ""),
    name: String(formData.get("name") ?? ""),
    priceCents: parseMoneyToCents(formData.get("price")),
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  });
  revalidatePath("/cardapio/adicionais");
}

export async function linkModifierGroupAction(formData: FormData) {
  await ModifierService.linkGroupToProduct(
    String(formData.get("productId") ?? ""),
    String(formData.get("modifierGroupId") ?? ""),
    integer(formData.get("sortOrder")),
  );
  revalidatePath("/cardapio/produtos");
}

export async function uploadCatalogImageAction(formData: FormData) {
  const file = optionalFile(formData.get("file"));
  if (!file) throw new Error("Escolha uma imagem para enviar.");
  return CatalogImageService.upload(file);
}
