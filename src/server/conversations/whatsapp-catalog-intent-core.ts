import { normalizeGenericInformalPortuguese } from "@/server/conversations/generic-language-normalization";

function normalize(value: string | null | undefined) {
  return normalizeGenericInformalPortuguese(value)
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function asksForMenuDescription(value: string | null | undefined) {
  const text = normalize(value);
  if (!text) return false;
  return /\b(?:descreve|descrever|descricao|resumo|resume|resumir|explica|explicar|fala|falar)\b.*\b(?:cardapio|menu)\b/.test(text)
    || /\b(?:cardapio|menu)\b.*\b(?:descreve|descricao|resumo|resume|explica)\b/.test(text);
}

export function catalogAvailabilityQueryFromInput(value: string | null | undefined) {
  const text = normalize(value);
  if (!text) return null;
  const match = text.match(/(?:^|\b)(?:tem|temos|voces tem|voces possuem|possui|vende|vendem)\s+(.+)$/);
  if (!match?.[1]) return null;
  const query = match[1]
    .replace(/\b(?:ai|agora|hoje|disponivel|disponiveis|no cardapio|no menu)\b/g, " ")
    .replace(/^(?:o|a|os|as|um|uma|uns|umas)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || ["cardapio", "menu", "pedido", "entrega"].includes(query)) return null;
  return query;
}

export function explicitCatalogItemRequest(value: string | null | undefined) {
  const text = normalize(value);
  const match = text.match(/^(\d{1,2})\s+(?:x\s+)?(.+)$/);
  if (!match?.[2]) return null;
  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  const query = match[2].trim();
  return query.length >= 2 ? { quantity, query } : null;
}
