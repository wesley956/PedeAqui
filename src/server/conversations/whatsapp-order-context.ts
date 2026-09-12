import { normalizeInformalPortuguese, normalizeProductLanguage } from "@/server/conversations/language-normalization";

export type PendingChoice = {
  label: string;
  value: string;
};

export type OrderCompositionPart = {
  quantity: number;
  label: string;
  normalizedLabel: string;
};

export type OrderComposition = {
  total: number;
  parts: OrderCompositionPart[];
};

const ORDINAL_INDEX: Record<string, number> = {
  "primeira": 0,
  "primeiro": 0,
  "segunda": 1,
  "segundo": 1,
  "terceira": 2,
  "terceiro": 2,
  "quarta": 3,
  "quarto": 3,
  "quinta": 4,
  "quinto": 4,
};

function compact(value: string) {
  return normalizeInformalPortuguese(value)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolvePendingChoiceReference(text: string | null | undefined, choices: PendingChoice[]) {
  if (!text || choices.length === 0) return null;
  const normalized = compact(text);

  const numeric = normalized.match(/^(?:opcao )?(\d{1,2})$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    return index >= 0 && index < choices.length ? choices[index] : null;
  }

  for (const [word, index] of Object.entries(ORDINAL_INDEX)) {
    if (normalized === word || normalized === `a ${word}` || normalized === `opcao ${word}`) {
      return index < choices.length ? choices[index] : null;
    }
  }

  if (["essa", "esse", "essa mesma", "esse mesmo", "essa ai", "esse ai", "pode ser essa", "pode ser esse"].includes(normalized)) {
    return choices.length === 1 ? choices[0] : null;
  }

  const exact = choices.find((choice) => compact(choice.label) === normalized || compact(choice.value) === normalized);
  return exact ?? null;
}

function parsePart(raw: string): OrderCompositionPart | null {
  const normalized = compact(raw);
  const match = normalized.match(/^(\d{1,3})\s+(?:x\s+)?(.{2,})$/);
  if (!match) return null;
  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  const label = match[2].trim();
  return { quantity, label, normalizedLabel: normalizeProductLanguage(label) };
}

export function parseOrderComposition(text: string | null | undefined): OrderComposition | null {
  if (!text) return null;
  const pieces = text
    .split(/[\n,;]+|\s+e\s+(?=\d)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const parts = pieces.map(parsePart).filter((part): part is OrderCompositionPart => Boolean(part));
  if (parts.length < 2) return null;
  const total = parts.reduce((sum, part) => sum + part.quantity, 0);
  if (total < 2 || total > 100) return null;
  return { total, parts };
}

export function inferProductCapacityFromName(name: string | null | undefined) {
  const normalized = normalizeProductLanguage(name);
  const explicit = normalized.match(/\b(\d{1,3})\s*(?:unidade|unidades|salgado|salgados|mini|peca|pecas)?\b/);
  if (!explicit) return null;
  const quantity = Number(explicit[1]);
  return Number.isInteger(quantity) && quantity >= 2 && quantity <= 100 ? quantity : null;
}

export function compositionFitsProduct(text: string, productName: string) {
  const composition = parseOrderComposition(text);
  const capacity = inferProductCapacityFromName(productName);
  return Boolean(composition && capacity && composition.total === capacity);
}
