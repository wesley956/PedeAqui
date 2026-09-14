import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { paymentMethodLabels, type PaymentMethod } from "@/server/checkout/schemas";

export type WhatsAppPaymentOption = {
  method: PaymentMethod;
  enabled: boolean;
  sortOrder: number;
  customPaymentMethodId?: string;
  label?: string;
};

export type WhatsAppPaymentSelection = {
  method: PaymentMethod;
  customPaymentMethodId: string | null;
  label: string;
};

const aliases: Record<Exclude<PaymentMethod, "custom">, string[]> = {
  cash: ["dinheiro", "cash"],
  pix: ["pix", "pics", "piks", "piz", "pixs"],
  credit_card: ["credito", "cartao de credito", "cartao credito", "credito no cartao"],
  debit_card: ["debito", "cartao de debito", "cartao debito", "debito no cartao"],
};

function optionLabel(option: WhatsAppPaymentOption) {
  if (option.method === "custom") return option.label?.trim() || paymentMethodLabels.custom;
  return paymentMethodLabels[option.method];
}

export function enabledWhatsAppPaymentOptions(options: WhatsAppPaymentOption[]) {
  return options.filter((option) => option.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function buildWhatsAppPaymentPrompt(options: WhatsAppPaymentOption[]) {
  const enabled = enabledWhatsAppPaymentOptions(options);
  if (!enabled.length) {
    return "Não há uma forma de pagamento disponível no momento. Digite 3 para falar com a equipe.";
  }
  const lines = enabled.map((option, index) => `${index + 1} — ${optionLabel(option)}`);
  return `Como será o pagamento?\n${lines.join("\n")}`;
}

export function resolveWhatsAppPaymentSelection(
  text: string,
  options: WhatsAppPaymentOption[],
): WhatsAppPaymentSelection | null {
  const enabled = enabledWhatsAppPaymentOptions(options);
  const normalized = normalizeBotInput(text);
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const selected = enabled[Number(normalized) - 1];
    return selected ? {
      method: selected.method,
      customPaymentMethodId: selected.method === "custom" ? selected.customPaymentMethodId ?? null : null,
      label: optionLabel(selected),
    } : null;
  }

  for (const option of enabled) {
    const label = optionLabel(option);
    const normalizedLabel = normalizeBotInput(label);
    if (normalized === normalizedLabel) {
      return {
        method: option.method,
        customPaymentMethodId: option.method === "custom" ? option.customPaymentMethodId ?? null : null,
        label,
      };
    }
    if (option.method !== "custom" && aliases[option.method].includes(normalized)) {
      return { method: option.method, customPaymentMethodId: null, label };
    }
  }

  return null;
}
