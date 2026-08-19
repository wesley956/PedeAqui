export const MAX_STORE_SLUG_LENGTH = 63;

export function slugifyStoreName(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (slug || "loja").slice(0, MAX_STORE_SLUG_LENGTH);
}

export function storeSlugCandidate(storeName: string, attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error("Slug attempt must be a non-negative integer");
  }

  const base = slugifyStoreName(storeName);
  if (attempt === 0) return base;

  const suffix = `-${attempt + 1}`;
  return `${base.slice(0, MAX_STORE_SLUG_LENGTH - suffix.length)}${suffix}`;
}

export function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return (error as { code?: unknown }).code === "23505";
}
