export const DEFAULT_STORE_TIMEZONE = "America/Sao_Paulo";

type DateValue = string | number | Date | null | undefined;

function parsedDate(value: DateValue) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatStoreDateTime(
  value: DateValue,
  timeZone = DEFAULT_STORE_TIMEZONE,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
) {
  const date = parsedDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone }).format(date);
}

export function formatStoreDate(
  value: DateValue,
  timeZone = DEFAULT_STORE_TIMEZONE,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short" },
) {
  const date = parsedDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone }).format(date);
}
