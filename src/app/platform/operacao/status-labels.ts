// Nomes em português para os estados do pedido nas telas de diagnóstico da plataforma.
// O código interno continua aparecendo em letra pequena: é o que se procura no banco e nos registros.
const labels: Record<string, Record<string, string>> = {
  order: { pending_confirmation: "Aguardando confirmação", confirmed: "Confirmado", rejected: "Recusado", canceled: "Cancelado", completed: "Concluído" },
  payment: { pending: "Pendente", authorized: "Autorizado", paid: "Pago", failed: "Falhou", refunded: "Estornado", partially_refunded: "Estornado em parte", canceled: "Cancelado" },
  production: { pending_confirmation: "Aguardando confirmação", queued: "Na fila", preparing: "Em preparo", ready: "Pronto", canceled: "Cancelada", not_required: "Sem produção" },
  fulfillment: { pending: "Pendente", awaiting_assignment: "Aguardando entregador", assigned: "Entregador definido", picked_up: "Retirado pelo entregador", out_for_delivery: "Saiu para entrega", delivered: "Entregue", awaiting_pickup: "Aguardando retirada", picked_up_by_customer: "Retirado pelo cliente", served: "Servido", canceled: "Cancelada", not_required: "Sem entrega ou retirada" },
  method: { cash: "Dinheiro", pix: "Pix", credit_card: "Cartão de crédito", debit_card: "Cartão de débito" },
};

export function platformStateLabel(domain: "order" | "payment" | "production" | "fulfillment" | "method", value: string | null | undefined) {
  if (!value) return "Não informado";
  return labels[domain]?.[value] ?? value;
}
