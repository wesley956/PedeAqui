import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

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
    throw new Error("Image must be between 1 byte and 5 MB");
  }
  if (!ALLOWED_CATALOG_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only JPEG, PNG and WebP images are supported");
  }
}

export function buildCatalogImagePath(organizationId: string, storeId: string, mimeType: string) {
  const extension = extensions[mimeType];
  if (!extension) throw new Error("Unsupported image type");
  return `${organizationId}/${storeId}/${randomUUID()}.${extension}`;
}

export class CatalogImageService {
  static async upload(file: File) {
    validateCatalogImage(file);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required for catalog images");

    const path = buildCatalogImagePath(context.organizationId, context.storeId, file.type);
    const admin = createAdminClient();
    const { error } = await admin.storage.from(CATALOG_MEDIA_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }
}
