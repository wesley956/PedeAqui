import { normalizeBotInput } from "@/server/conversations/bot-menu";

export function asksAboutPixPayment(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return /\b(?:pix|pics|piks|piz|pixs)\b/i.test(normalized);
}

export function pixPaymentGuidanceMessage() {
  return "As formas de pagamento válidas são as que esta loja disponibiliza no pedido 😊 Se *Pix* aparecer entre as opções, selecione Pix. Se não aparecer, eu não vou assumir que a loja aceita Pix nem transformar outra forma de pagamento em Pix. Escolha uma das opções exibidas ou peça atendimento para confirmar.";
}
