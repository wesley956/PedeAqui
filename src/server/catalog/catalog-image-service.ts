import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";

export const CATALOG_MEDIA_BUCKET = "catalog-media";
export const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_CATALOG_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateCatalogImage(file: Pick<File, "size" | "type">) {
  if (file.size <= 0 || file.size > MAX_CATALOG_IMAGE_BYTES) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }
  if (!ALLOWED_CATALOG_IMAGE_TYPES.has(file.type)) {
    throw new Error("Escolha uma imagem JPEG, PNG ou WebP.");
  }
}

function safePurpose(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(normalized)) throw new Error("Invalid media purpose");
  return normalized;
}

export function buildCatalogImagePath(organizationId: string, storeId: string, mimeType: string, purpose?: string) {
  const extension = extensions[mimeType];
  if (!extension) throw new Error("Unsupported image type");
  const folder = safePurpose(purpose);
  const fileName = `${randomUUID()}.${extension}`;
  return folder
    ? `${organizationId}/${storeId}/${folder}/${fileName}`
    : `${organizationId}/${storeId}/${fileName}`;
}

export class CatalogImageService {
  static async upload(file: File, options?: { permission?: PermissionKey; purpose?: string }) {
    validateCatalogImage(file);
    const context = await authorize(options?.permission ?? PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("É necessário selecionar uma unidade para enviar imagens.");

    const path = buildCatalogImagePath(context.organizationId, context.storeId, file.type, options?.purpose);
    const admin = createAdminClient();
    const { error } = await admin.storage.from(CATALOG_MEDIA_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error("Não foi possível enviar a imagem. Tente novamente.");

    const { data } = admin.storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }
}
