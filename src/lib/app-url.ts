export function normalizeAppUrl(value: string | null | undefined, fallback: string) {
  const fallbackUrl = fallback.trim().replace(/\/+$/, "");
  const candidate = value?.trim().replace(/\/+$/, "");
  return candidate || fallbackUrl;
}
