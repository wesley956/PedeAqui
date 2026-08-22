export function friendlyPaymentActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const raw = message.toLocaleLowerCase("pt-BR");

  if (raw.includes("too_small") || raw.includes("reason") && raw.includes("required")) {
    return "Informe um motivo com pelo menos 3 caracteres.";
  }
  if (raw.includes("open cash session required for cash payment")) {
    return "Abra o caixa antes de movimentar um pagamento em dinheiro.";
  }
  if (raw.includes("cash outflow exceeds expected balance")) {
    return "O caixa aberto não possui saldo físico esperado suficiente para este estorno.";
  }
  if (raw.includes("only paid payment can be refunded") || raw.includes("only paid payments can be refunded") || raw.includes("payment must be paid")) {
    return "Este pagamento não está mais disponível para estorno. Atualize o pedido e confira a situação atual.";
  }
  if (raw.includes("payment not found") || raw.includes("order not found")) {
    return "Pagamento não encontrado neste pedido ou nesta unidade.";
  }
  if (raw.includes("cash received") && (raw.includes("cover") || raw.includes("below"))) {
    return "O valor recebido precisa ser igual ou maior que o valor do pagamento.";
  }
  if ((raw.includes("invalid") && raw.includes("transition")) || raw.includes("current status")) {
    return "O pagamento mudou de situação. Confira o estado atual e tente novamente.";
  }
  return "Não foi possível atualizar o pagamento. Confira a situação atual e tente novamente.";
}
