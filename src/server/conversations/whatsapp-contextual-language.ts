import { normalizeGenericInformalPortuguese } from "@/server/conversations/generic-language-normalization";

function normalized(text: string | null | undefined) {
  return normalizeGenericInformalPortuguese(text).replace(/[!?.,;:]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(?:(?:oi|ola|oie|bom dia|boa tarde|boa noite|entao|me ajuda)\s+)+/, "")
    .replace(/\s+por favor$/, "").trim();
}

export function isNaturalTrackingQuestion(text: string | null | undefined) {
  const value = normalized(text);
  return /\b(?:o meu|meu pedido)\s+(?:ja\s+)?(?:esta|ta|ficou|saiu|chegou|foi entregue)\b/.test(value)
    || /^(?:ja\s+)?(?:ficou|esta|ta)\s+pronto\b/.test(value)
    || /\bposso\s+(?:ir\s+)?(?:buscar|retirada)\b/.test(value);
}

export function resolveNaturalPixSpeech(text: string | null | undefined): "selection" | "availability" | "instructions" | null {
  const value = normalized(text);
  const pix = /\b(?:pix|pics|piz|pixs)\b/.test(value);
  if (/\b(?:manda|mandar|envia|enviar|passa|passar)\b.*\b(?:chave|qr|codigo)\b/.test(value)) return "instructions";
  if (!pix) return null;
  if (/\b(?:aceita|aceitam|tem|teria|posso|pode|como|disponivel|nao)\b/.test(value)) return "availability";
  if (/^(?:(?:eu\s+)?(?:quero|vou|prefiro|gostaria de)\s+(?:pagar\s+)?(?:no|com|via|por)\s+|(?:seria|sera|vai ser|o pagamento seria)\s+(?:no|com|via|por)\s+)?(?:pix|pics|piz|pixs)(?:\s+(?:mesmo|por favor))?$/.test(value)) return "selection";
  return "availability";
}

// Used only by the canonical checkout at the fulfillment step. Alternatives,
// negations and status questions require clarification instead of a mutation.
export function resolveNaturalFulfillment(text: string | null | undefined): "delivery" | "pickup" | null {
  const value = normalized(text);
  if (/\b(?:se|nao|ou|talvez|quanto|qual|taxa|tempo|faz|fazem|tem)\b/.test(value)) return null;
  if (isNaturalTrackingQuestion(text) && !/^posso\s+(?:ir\s+)?(?:buscar|retirada)(?:\s+ai)?$/.test(value)) return null;
  const delivery = /\b(?:entrega|entregar)\b/.test(value);
  const pickup = /\b(?:retirada|buscar)\b/.test(value);
  if (delivery && pickup) return null;
  if (value === "1" || delivery) return "delivery";
  if (value === "2" || pickup) return "pickup";
  return null;
}
