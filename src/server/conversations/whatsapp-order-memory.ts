export type WhatsAppOrderMemoryContext = Record<string, unknown> & {
  pendingQuantity?: number;
  pendingAddressParts?: string[];
  savedAddressChoices?: unknown[];
};

function asContext(value: unknown): WhatsAppOrderMemoryContext {
  return value && typeof value === "object"
    ? value as WhatsAppOrderMemoryContext
    : {};
}

export function pendingOrderQuantity(value: unknown) {
  const quantity = asContext(value).pendingQuantity;
  return Number.isInteger(quantity) && Number(quantity) > 0 && Number(quantity) <= 99
    ? Number(quantity)
    : null;
}

export function rememberOrderQuantity(value: unknown, quantity: number) {
  return { ...asContext(value), pendingQuantity: quantity } as WhatsAppOrderMemoryContext;
}

export function clearPendingOrderQuantity(value: unknown) {
  const { pendingQuantity: _pendingQuantity, ...rest } = asContext(value);
  return rest as WhatsAppOrderMemoryContext;
}

export function pendingAddressParts(value: unknown) {
  const parts = asContext(value).pendingAddressParts;
  return Array.isArray(parts)
    ? parts.filter((part): part is string => typeof part === "string" && Boolean(part.trim())).map((part) => part.trim()).slice(0, 6)
    : [];
}

export function hasSavedAddressChoices(value: unknown) {
  const choices = asContext(value).savedAddressChoices;
  return Array.isArray(choices) && choices.length > 0;
}

export function rememberAddressParts(value: unknown, parts: string[]) {
  return { ...asContext(value), pendingAddressParts: parts.slice(0, 6) } as WhatsAppOrderMemoryContext;
}

export function clearPendingAddressParts(value: unknown) {
  const { pendingAddressParts: _pendingAddressParts, ...rest } = asContext(value);
  return rest as WhatsAppOrderMemoryContext;
}

export function addressPartsFromMessage(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return [];

  const normalizedSeparators = raw.replace(/\s+-\s+/g, ", ");
  let parts = normalizedSeparators.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 1) {
    const streetAndNumber = parts[0]!.match(/^(.+?\D)\s+(\d+[a-zA-Z]?)$/);
    if (streetAndNumber) parts = [streetAndNumber[1]!.trim(), streetAndNumber[2]!.trim()];
  }

  const last = parts.at(-1);
  const cityAndState = last?.match(/^(.+?)\s*\/\s*([a-zA-Z]{2})$/);
  if (cityAndState) {
    parts = [...parts.slice(0, -1), cityAndState[1]!.trim(), cityAndState[2]!.toUpperCase()];
  }

  return parts.slice(0, 6);
}

export function addressProgressPrompt(collectedParts: number) {
  const prompts = ["a rua", "o número", "o bairro", "a cidade", "a UF"];
  const next = prompts[Math.max(0, Math.min(collectedParts, prompts.length - 1))];
  return collectedParts === 0
    ? "Envie primeiro o nome da rua. Vou guardar cada parte até completar o endereço."
    : `Certo, guardei essa parte do endereço. Agora envie ${next}.`;
}
