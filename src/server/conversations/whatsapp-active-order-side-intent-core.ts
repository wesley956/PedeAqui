import { normalizeBotInput, trackingCodeFromInput } from "@/server/conversations/bot-menu";

export function isActiveOrderTrackingQuestion(text: string) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return normalized === "meu pedido"
    || normalized === "acompanhar pedido"
    || normalized === "status do pedido"
    || normalized.includes("onde esta meu pedido")
    || normalized.includes("como esta meu pedido")
    || normalized.includes("meu pedido ja saiu")
    || normalized.includes("acompanhar meu pedido");
}

export function activeOrderTrackingCodeFromInput(text: string) {
  const normalized = normalizeBotInput(text);
  if (!/\b(?:pedido|codigo)\b/.test(normalized)) return null;
  return trackingCodeFromInput(text);
}
