import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";
import { logger } from "@/server/observability/logger";
import {
  ALLOWED_CATALOG_IMAGE_TYPES,
  MAX_CATALOG_IMAGE_BYTES,
  validateCatalogImage,
} from "@/server/catalog/catalog-image-policy";
import { optimizeCatalogImage } from "@/server/catalog/catalog-image-optimizer";

export { ALLOWED_CATALOG_IMAGE_TYPES, MAX_CATALOG_IMAGE_BYTES, validateCatalogImage };

export const CATALOG_MEDIA_BUCKET = "catalog-media";
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type CatalogImageUpload = {
  path: string;
  publicUrl: string;
};

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

function validateUploadedPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("..")) {
    throw new Error("Invalid catalog media path");
  }
}

export class CatalogImageService {
  static async upload(file: File, options?: { permission?: PermissionKey; purpose?: string }): Promise<CatalogImageUpload> {
    validateCatalogImage(file);
    const context = await authorize(options?.permission ?? PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("É necessário selecionar uma unidade para enviar imagens.");

    const optimized = await optimizeCatalogImage(file, options?.purpose);
    const path = buildCatalogImagePath(context.organizationId, context.storeId, optimized.contentType, options?.purpose);
    const admin = createAdminClient();
    const { error } = await admin.storage.from(CATALOG_MEDIA_BUCKET).upload(path, optimized.data, {
      contentType: optimized.contentType,
      cacheControl: "31536000",
      upsert: false,
    });

    if (error) {
      logger.error("catalog_image_upload_failed", {
        organizationId: context.organizationId,
        storeId: context.storeId,
        bucket: CATALOG_MEDIA_BUCKET,
        path,
        storageCode: "statusCode" in error ? error.statusCode : undefined,
        storageError: error.message,
      });
      throw new Error("Não foi possível enviar a imagem. Tente novamente.");
    }

    const { data } = admin.storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  static async remove(path: string) {
    validateUploadedPath(path);
    const admin = createAdminClient();
    const { error } = await admin.storage.from(CATALOG_MEDIA_BUCKET).remove([path]);

    if (error) {
      logger.error("catalog_image_rollback_failed", {
        bucket: CATALOG_MEDIA_BUCKET,
        path,
        storageCode: "statusCode" in error ? error.statusCode : undefined,
        storageError: error.message,
      });
      throw new Error("Catalog media rollback failed");
    }
  }
}
