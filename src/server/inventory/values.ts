import { parseMoneyToCents } from "@/server/catalog/money";

export type InventoryBaseUnit = "unit" | "g" | "ml";

export function parseInventoryQuantity(value: string, options: { allowNegative?: boolean; allowZero?: boolean } = {}) {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d{1,12}(?:\.\d{1,6})?$/.test(normalized)) throw new Error("Quantidade inválida. Use até 6 casas decimais.");
  const negative = normalized.startsWith("-");
  const magnitude = normalized.replace("-", "").replace(".", "").replace(/^0+/, "") || "0";
  if (negative && !options.allowNegative) throw new Error("A quantidade deve ser positiva.");
  if (magnitude === "0" && !options.allowZero) throw new Error("A quantidade deve ser maior que zero.");
  return normalized;
}

export function costInputToMicrosPerBaseUnit(value: string, baseUnit: InventoryBaseUnit) {
  if (!value.trim()) return 0;
  const cents = parseMoneyToCents(value);
  const micros = baseUnit === "unit" ? cents * 1_000_000 : cents * 1_000;
  if (!Number.isSafeInteger(micros) || micros < 0) throw new Error("Custo fora do intervalo permitido.");
  return micros;
}

export function costInputLabel(baseUnit: InventoryBaseUnit) {
  if (baseUnit === "g") return "Custo por kg (R$)";
  if (baseUnit === "ml") return "Custo por litro (R$)";
  return "Custo por unidade (R$)";
}

export function formatQuantity(quantity: string | number, baseUnit: InventoryBaseUnit) {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return `${quantity} ${baseUnit}`;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(value)} ${baseUnit === "unit" ? "un" : baseUnit}`;
}
