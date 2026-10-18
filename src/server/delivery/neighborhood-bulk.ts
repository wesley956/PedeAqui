import { parseMoneyToCents } from "@/server/catalog/money";

export type BulkNeighborhoodLine = { line: number; name: string; feeCents: number };
export type BulkNeighborhoodError = { line: number; text: string; reason: string };

/**
 * Lê a lista colada pelo lojista, uma linha por bairro, com a taxa no fim:
 *   "Centro; 5,00"   "Jardim América - 7"   "Vila Nova\t6,50"   "São Vito R$ 8,00"
 * Linhas vazias são ignoradas; linhas sem taxa ou com nome curto voltam como erro, com o número da linha.
 */
export function parseNeighborhoodList(text: string): { rows: BulkNeighborhoodLine[]; errors: BulkNeighborhoodError[] } {
  const rows: BulkNeighborhoodLine[] = [];
  const errors: BulkNeighborhoodError[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const value = raw.trim();
    if (!value) return;
    const match = value.match(/^(.*?)[\s;:|\t\-–—=]*(?:R\$\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:reais)?$/i);
    const name = match?.[1]?.replace(/[\s;:|\t\-–—=]+$/, "").trim() ?? "";
    if (!match || !match[2]) {
      errors.push({ line, text: value, reason: "faltou a taxa no fim da linha" });
      return;
    }
    if (name.length < 2) {
      errors.push({ line, text: value, reason: "nome do bairro muito curto" });
      return;
    }
    let feeCents: number;
    try {
      feeCents = parseMoneyToCents(match[2]);
    } catch {
      errors.push({ line, text: value, reason: "taxa inválida" });
      return;
    }
    const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
    if (seen.has(key)) {
      errors.push({ line, text: value, reason: "bairro repetido na lista" });
      return;
    }
    seen.add(key);
    rows.push({ line, name, feeCents });
  });
  return { rows, errors };
}
