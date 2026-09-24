import { normalizeGenericInformalPortuguese } from "@/server/conversations/generic-language-normalization";

const explicitMenuNavigationPhrases = new Set([
  "menu",
  "inicio",
  "iniciar",
  "ver opcoes",
  "voltar as opcoes",
  "voltar para as opcoes",
  "voltar pras opcoes",
  "voltar pro menu",
  "voltar para o menu",
  "voltar ao menu",
  "voltar do inicio",
  "voltar ao inicio",
  "voltar para o inicio",
  "quero voltar do inicio",
  "quero voltar ao inicio",
  "comecar de novo",
  "quero comecar de novo",
  "recomecar",
  "reiniciar",
]);

function normalizeNavigationInput(value: string | null | undefined) {
  return normalizeGenericInformalPortuguese(value)
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isExplicitMenuNavigation(value: string | null | undefined) {
  const normalized = normalizeNavigationInput(value);
  if (!normalized) return false;
  if (explicitMenuNavigationPhrases.has(normalized)) return true;

  return /^(?:certo|ok|okay|beleza|blz)\s+(?:quero\s+)?(?:voltar|retornar)\s+(?:para\s+|pro\s+|ao\s+|as\s+|a\s+|do\s+)?(?:menu|inicio|opcoes)$/.test(normalized);
}
