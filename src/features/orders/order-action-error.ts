export function friendlyOrderActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Reason is required") || message.includes("too_small")) {
    return "Informe um motivo com pelo menos 3 caracteres.";
  }
  if (message.includes("Fulfilled order cannot be canceled or rejected")) {
    return "Este pedido já foi entregue ou retirado e não pode mais ser cancelado.";
  }
  if (message.includes("Fulfillment must be complete")) {
    return "Conclua primeiro a entrega, retirada ou atendimento do pedido.";
  }
  if (message.includes("Payment must be settled") || message.includes("No pending payment found")) {
    return "Confirme o pagamento antes de concluir o pedido.";
  }
  if (message.includes("Production must be ready")) {
    return "Marque o pedido como pronto antes de avançar esta etapa.";
  }
  if (message.includes("Order must be confirmed")) {
    return "Aceite o pedido antes de iniciar esta etapa.";
  }
  if (message.includes("Invalid ") && message.includes(" transition:")) {
    return "O pedido mudou de etapa. Confira a situação atual e tente novamente.";
  }
  if (message.includes("Order not found")) {
    return "Pedido não encontrado nesta unidade.";
  }
  if (message.includes("Only confirmed orders can be routed to printing")) {
    return "Aceite o pedido antes de solicitar a impressão.";
  }
  if (message.includes("No active print routes")) {
    return "Nenhuma rota de impressão ativa atende aos itens deste pedido. Revise estações e impressoras.";
  }
  return "Não foi possível concluir esta ação. Confira a situação atual e tente novamente.";
}
