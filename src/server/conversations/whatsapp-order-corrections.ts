import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { inferProductCapacityFromName } from "@/server/conversations/whatsapp-order-context";

export function isOrderEditRequest(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return [
    "mudar pedido",
    "mudar o pedido",
    "mudar meu pedido",
    "quero mudar pedido",
    "quero mudar o pedido",
    "quero mudar meu pedido",
    "alterar pedido",
    "alterar o pedido",
    "alterar meu pedido",
    "quero alterar pedido",
    "quero alterar o pedido",
    "trocar pedido",
    "trocar o pedido",
    "refazer pedido",
    "refazer o pedido",
    "recomecar pedido",
    "recomecar o pedido",
  ].includes(normalized)
    || /\b(?:mudar|alterar|trocar|refazer|recomecar)\b.*\bpedido\b/.test(normalized)
    || /\bnao\s+quero\s+\d{1,3}\s+(?:caixa|caixas|copo|copos|combo|combos|kit|kits|pacote|pacotes|porcao|porcoes)\b/.test(normalized)
    || /\b(?:e|eh|era)\s+so\s+(?:uma|1)\s+(?:caixa|copo|combo|kit|pacote|porcao)\b/.test(normalized)
    || /\b(?:uma|1)\s+(?:caixa|copo|combo|kit|pacote|porcao)\s+so\b/.test(normalized);
}

function explicitlyRequestsManyPackages(text: string, quantity: number) {
  const normalized = normalizeBotInput(text);
  return new RegExp(`\\b${quantity}\\s+(?:caixa|caixas|copo|copos|combo|combos|kit|kits|pacote|pacotes|porcao|porcoes)\\b`, "i").test(normalized);
}

function looksLikeNamedPackageSelection(text: string) {
  const normalized = normalizeBotInput(text);
  if (/^(?:opcao\s+)?\d{1,2}$/.test(normalized)) return false;
  if (/^(?:a\s+)?(?:primeira|primeiro|segunda|segundo|terceira|terceiro|quarta|quarto|quinta|quinto)$/.test(normalized)) return false;
  return /\b(?:caixa|copo|combo|kit|pacote|porcao)\b/.test(normalized);
}

function selectedChoiceIndex(text: string, length: number) {
  const normalized = normalizeBotInput(text);
  const numeric = normalized.match(/^(?:opcao\s+)?(\d{1,2})$/);
  if (!numeric) return null;
  const index = Number(numeric[1]) - 1;
  return index >= 0 && index < length ? index : null;
}

export function repairSuspiciousPackageQuantity(context: unknown, text: string) {
  if (!context || typeof context !== "object") return context;
  const raw = context as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = { ...raw };

  if (Array.isArray(raw.pendingChoices)) {
    const selectedIndex = selectedChoiceIndex(text, raw.pendingChoices.length);
    const mentionedNumbers = [...normalizeBotInput(text).matchAll(/\b(\d{1,3})\b/g)].map((match) => Number(match[1]));
    next.pendingChoices = raw.pendingChoices.map((entry, index) => {
      if (!entry || typeof entry !== "object") return entry;
      const choice = entry as Record<string, unknown>;
      const name = typeof choice.name === "string" ? choice.name : "";
      const quantity = typeof choice.quantity === "number" ? choice.quantity : null;
      const capacity = inferProductCapacityFromName(name);
      const selectedByNumber = selectedIndex === index;
      const namedSelection = looksLikeNamedPackageSelection(text) && capacity !== null && mentionedNumbers.includes(capacity);
      if (
        capacity
        && quantity === capacity
        && (selectedByNumber || namedSelection)
        && !explicitlyRequestsManyPackages(text, quantity)
      ) {
        changed = true;
        return { ...choice, quantity: 1 };
      }
      return entry;
    });
  }

  if (raw.pendingComposition && typeof raw.pendingComposition === "object") {
    const composition = raw.pendingComposition as Record<string, unknown>;
    const name = typeof composition.name === "string" ? composition.name : "";
    const quantity = typeof composition.quantity === "number" ? composition.quantity : null;
    const total = typeof composition.distributionTotal === "number" ? composition.distributionTotal : null;
    const capacity = inferProductCapacityFromName(name);
    if (
      quantity
      && total
      && quantity === total
      && capacity === total
      && !explicitlyRequestsManyPackages(text, quantity)
    ) {
      next.pendingComposition = { ...composition, quantity: 1 };
      changed = true;
    }
  }

  return changed ? next : context;
}

export function restartOrderMessage() {
  return "Claro 😊 Vamos refazer o pedido. Desconsiderei a montagem anterior para não manter itens errados.\n\nMe envie novamente os itens e quantidades do jeito que preferir.";
}
