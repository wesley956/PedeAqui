import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { enabledWhatsAppPaymentOptions, type WhatsAppPaymentOption } from "@/server/conversations/whatsapp-payment-methods";
import { paymentMethodLabels } from "@/server/checkout/schemas";

export function asksAboutPixPayment(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return /\b(?:pix|pics|piks|piz|pixs)\b/i.test(normalized);
}

function optionLabel(option: WhatsAppPaymentOption) {
  if (option.method === "custom") return option.label?.trim() || paymentMethodLabels.custom;
  return paymentMethodLabels[option.method];
}

export function canonicalPaymentGuidanceMessage(options: WhatsAppPaymentOption[], text?: string | null) {
  const enabled = enabledWhatsAppPaymentOptions(options);
  const labels = enabled.map(optionLabel);
  if (!enabled.length) return "Não há uma forma de pagamento disponível no momento. Peça atendimento para confirmar com a equipe.";

  if (asksAboutPixPayment(text)) {
    const pixAvailable = enabled.some((option) => option.method === "pix");
    if (!pixAvailable) {
      return `Pix não está disponível nesta loja neste momento. As formas de pagamento disponíveis são: ${labels.join(", ")}.`;
    }
    return `Sim 😊 Pix está disponível nesta loja. As formas de pagamento disponíveis são: ${labels.join(", ")}.`;
  }

  return `Formas de pagamento disponíveis: ${labels.join(", ")}.`;
}

export function pixPaymentGuidanceMessage() {
  return "As formas de pagamento válidas são as que esta loja disponibiliza no pedido 😊 Se *Pix* aparecer entre as opções, selecione Pix. Se não aparecer, eu não vou assumir que a loja aceita Pix nem transformar outra forma de pagamento em Pix. Escolha uma das opções exibidas ou peça atendimento para confirmar.";
}
