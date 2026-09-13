import { normalizeBotInput } from "@/server/conversations/bot-menu";

export type WhatsAppSavedAddress = {
  id: string;
  customer_id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  is_default: boolean;
};

export function asksAboutSavedAddress(text: string | null | undefined) {
  const n = normalizeBotInput(text);
  if (!n || !n.includes("endereco")) return false;
  return /\b(?:ja|tem|sabe|salvo|cadastrado|guardado|registrado)\b/.test(n)
    || n.includes("meu endereco");
}

export function asksForTrackingNumberHelp(text: string | null | undefined) {
  const n = normalizeBotInput(text);
  if (!n) return false;
  return /\bnao sei\b.*\b(?:numero|codigo)\b/.test(n)
    || /\b(?:onde|como)\b.*\b(?:vejo|ver|aparece|achar|encontro)\b.*\b(?:numero|codigo|pedido)\b/.test(n)
    || /\b(?:perdi|esqueci|nao tenho)\b.*\b(?:numero|codigo)\b/.test(n);
}

export function quantityOnlyRequest(text: string | null | undefined) {
  const n = normalizeBotInput(text);
  const match = n.match(/^(?:quero\s+)?(\d{1,2})(?:\s+unidades?)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value <= 99 ? value : null;
}

export function formatSavedAddress(address: WhatsAppSavedAddress) {
  const label = address.label?.trim() ? `${address.label.trim()}: ` : "";
  const complement = address.complement?.trim() ? `, ${address.complement.trim()}` : "";
  return `${label}${address.street}, ${address.number}${complement} — ${address.district}, ${address.city}/${address.state}`;
}
