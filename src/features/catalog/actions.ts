"use server";

import { revalidatePath } from "next/cache";
import { CategoryService } from "@/server/catalog/category-service";
import { ProductService } from "@/server/catalog/product-service";
import { ModifierService } from "@/server/catalog/modifier-service";
import { CatalogImageService } from "@/server/catalog/catalog-image-service";
import { parseMoneyToCents } from "@/server/catalog/money";
import { productAvailabilitySchema } from "@/server/catalog/schemas";
import { PERMISSIONS } from "@/server/access/permissions";

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

async function uploadNewCatalogImage(value: FormDataEntryValue | null, purpose: "product" | "category") {
  const file = optionalFile(value);
  if (!file) return null;
  const uploaded = await CatalogImageService.upload(file, {
    permission: PERMISSIONS.PRODUCTS_CREATE,
    purpose,
  });
  return uploaded.publicUrl;
}

export async function createCategoryAction(formData: FormData) {
  const imageUrl = await uploadNewCatalogImage(formData.get("imageFile"), "category");
  await CategoryService.create({
    name: String(formData.get("name") ?? ""),
    description: optionalString(formData.get("description")),
    imageUrl,
    sortOrder: integer(formData.get("sortOrder")),
    active: formData.get("active") === "on",
  });
  revalidatePath("/cardapio/categorias");
}

export async function createProductAction(formData: FormData) {
  const promotional = formData.get("promotionalPrice");
  const cost = formData.get("cost");
  const imageUrl = await uploadNewCatalogImage(formData.get("imageFile"), "product");
  await ProductService.create({
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
    active: formData.get("active") === "on",
    availability: productAvailabilitySchema.parse(formData.get("availability") ?? "available"),
  });
  revalidatePath("/cardapio/produtos");
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
