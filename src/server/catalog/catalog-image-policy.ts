// Vercel Functions cap the complete request body at 4.5 MB. Keep enough room
// for multipart and Server Action metadata instead of failing at the proxy.
export const MAX_CATALOG_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_CATALOG_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateCatalogImage(file: Pick<File, "size" | "type">) {
  if (file.size <= 0 || file.size > MAX_CATALOG_IMAGE_BYTES) {
    throw new Error("A imagem deve ter no máximo 4 MB.");
  }
  if (!ALLOWED_CATALOG_IMAGE_TYPES.has(file.type)) {
    throw new Error("Escolha uma imagem JPEG, PNG ou WebP.");
  }
}
