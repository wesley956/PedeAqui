import { normalizeBotInput } from "@/server/conversations/bot-menu";

export type WhatsAppContextualQuestion =
  | { type: "list_flavors" }
  | { type: "has_flavor"; query: string };

const genericFlavorQuestions = [
  "quais sabores",
  "qual sabores",
  "que sabores",
  "quais os sabores",
  "quais sao os sabores",
  "quais recheios",
  "quais os recheios",
  "que recheios",
  "opcoes de sabor",
  "opcoes de sabores",
  "sabores disponiveis",
  "recheios disponiveis",
];

export function contextualOrderQuestion(text: string | null | undefined): WhatsAppContextualQuestion | null {
  const normalized = normalizeBotInput(text);
  if (!normalized) return null;

  if (genericFlavorQuestions.some((phrase) => normalized.includes(phrase))) {
    return { type: "list_flavors" };
  }

  const availability = normalized.match(/\b(?:tem sabor de|tem de|voc(?:e|es) tem|voces tem|tem)\s+(.{2,60})$/i);
  if (!availability?.[1]) return null;
  const query = availability[1]
    .replace(/^sabor de\s+/i, "")
    .replace(/\b(?:nesse|nessa|neste|nesta|na caixa|no pastel|nos salgados|de salgado|do salgado)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return query ? { type: "has_flavor", query } : null;
}
