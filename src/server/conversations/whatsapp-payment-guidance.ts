import { normalizeBotInput } from "@/server/conversations/bot-menu";

export function asksAboutPixPayment(text: string | null | undefined) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return /\b(?:pix|pics|piks|piz|pixs)\b/i.test(normalized);
}

export function pixPaymentGuidanceMessage() {
  return "Sim 😊 Para pagar pelo Pix, selecione *1 — Dinheiro*. Mesmo escolhendo Dinheiro no pedido, você poderá fazer o pagamento via Pix.\n\nResponda 1 para continuar com essa forma de pagamento, ou escolha outra opção disponível.";
}
