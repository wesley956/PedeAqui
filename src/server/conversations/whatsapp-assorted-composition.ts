import { normalizeBotInput } from "@/server/conversations/bot-menu";

const assortedPhrases = [
  "sortido",
  "sortidos",
  "variado",
  "variados",
  "misturado",
  "misturados",
  "mix",
  "todos os sabores",
  "todos sabores",
  "um pouco de cada",
  "de todos",
  "distribuicao igualitaria",
  "distribuir igual",
  "distribui igual",
  "divide igual",
  "dividir igual",
  "quantidade igual",
  "por igual",
  "pode escolher",
  "pode escolher para mim",
  "escolhe para mim",
  "escolhe voce",
  "pode montar",
  "monta para mim",
  "faz sortido",
  "faz variado",
  "faz como voce achar melhor",
];

export function assortedRequestedFlavorCount(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  const match = normalized.match(/\b(?:nos|em|entre)?\s*(\d{1,2})\s+sabores?\b/i);
  return match ? Number(match[1]) : null;
}

export function isAssortedCompositionRequest(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  if (assortedPhrases.some((phrase) => normalized.includes(phrase))) return true;
  return /\b(?:todos?|cada)\b.*\bsabores?\b/i.test(normalized)
    || /\b(?:igual|igualmente|igualitario|igualitaria)\b.*\b(?:sabores?|distribuicao)\b/i.test(normalized)
    || /\b(?:distribuicao|divisao)\b.*\b(?:igual|igualitaria|igualitario)\b/i.test(normalized);
}

export function buildEqualSplitCompositionText(total: number, modifierNames: string[]) {
  if (!Number.isInteger(total) || total < 1 || modifierNames.length < 1 || modifierNames.length > total) return null;
  const base = Math.floor(total / modifierNames.length);
  const remainder = total % modifierNames.length;
  return modifierNames
    .map((name, index) => `${base + (index < remainder ? 1 : 0)} ${name}`)
    .join(", ");
}
