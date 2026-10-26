export function metaNumericId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && /^[0-9]{1,21}$/.test(normalized) ? normalized : null;
}
export function metaSessionInfoVersion(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && /^[0-9]{1,2}$/.test(normalized) ? normalized : "3";
}
