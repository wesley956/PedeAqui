import { normalizeBotInput } from "@/server/conversations/bot-menu";

const standaloneAcknowledgements = new Set([
  "ok",
  "okay",
  "blz",
  "beleza",
  "certo",
  "entendi",
  "show",
  "top",
  "perfeito",
  "fechou",
  "ta bom",
  "esta bom",
  "obrigado",
  "obrigada",
  "muito obrigado",
  "muito obrigada",
  "valeu",
  "vlw",
  "agradeco",
  "grato",
  "grata",
  "tchau",
  "ate mais",
]);

/**
 * Social acknowledgements that do not ask the bot to perform work.
 *
 * This intentionally matches only short/standalone phrases. Messages such as
 * "ok quero 20 coxinhas" or "obrigado, onde esta meu pedido" must continue
 * through normal intent/order routing.
 */
export function isWhatsAppNonActionableAcknowledgement(value: string | null | undefined) {
  const normalized = normalizeBotInput(value);
  if (!normalized) return false;
  if (standaloneAcknowledgements.has(normalized)) return true;

  return /^(?:obrigado|obrigada|valeu|vlw)(?: mesmo| viu| pela ajuda| obrigado| obrigada)?$/.test(normalized);
}
