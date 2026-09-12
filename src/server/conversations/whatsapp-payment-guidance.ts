import { normalizeBotInput } from "@/server/conversations/bot-menu";

export function asksAboutPixPayment(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return /\b(?:pix|pics|piks|piz|pixs)\b/i.test(normalized);
}

export function pixPaymentGuidanceMessage() {
  return "Sim 😊 Você pode pagar via Pix *na entrega*. Como o pedido não tem uma opção separada de Pix, selecione *1 — Dinheiro*. Na hora da entrega, o pagamento poderá ser feito por Pix.\n\nResponda 1 para continuar com essa forma de pagamento, ou escolha outra opção disponível.";
}
