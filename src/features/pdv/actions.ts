"use server";

import { revalidatePath } from "next/cache";
import { PdvService } from "@/server/pdv/pdv-service";
import type { PosSaleInput } from "@/server/pdv/schemas";

function friendlyPdvError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Não foi possível finalizar a venda.";
  const messages: Array<[string, string]> = [
    ["product unavailable", "Um produto ficou indisponível. Atualize o PDV e revise a venda."],
    ["modifier unavailable", "Um adicional ficou indisponível. Atualize o PDV e revise a venda."],
    ["modifier group selection invalid", "Revise os adicionais obrigatórios do pedido."],
    ["payment method disabled", "A forma de pagamento selecionada foi desativada."],
    ["payment total does not match discounted order total", "Os pagamentos não fecham com o total após os benefícios."],
    ["payment total does not match order total", "Os pagamentos não fecham com o total atual do pedido."],
    ["cash received is below payment amount", "O valor recebido em dinheiro é menor que a parcela."],
    ["open cash session required for cash payment", "Abra o caixa antes de finalizar uma venda em dinheiro."],
    ["coupon not found", "Cupom não encontrado ou indisponível para esta venda."],
    ["coupon inactive", "Este cupom está inativo."],
    ["coupon outside validity window", "Este cupom está fora da validade."],
    ["coupon unavailable for channel", "Este cupom não pode ser usado no PDV."],
    ["coupon minimum order not reached", "O pedido não atingiu o valor mínimo do cupom."],
    ["coupon usage limit reached", "O limite de uso deste cupom foi atingido."],
    ["customer coupon usage limit reached", "Este cliente já atingiu o limite do cupom."],
    ["insufficient cashback balance", "O cliente não possui cashback suficiente."],
    ["insufficient loyalty balance", "O cliente não possui pontos suficientes."],
    ["cashback redemption disabled", "O resgate de cashback está desativado nesta unidade."],
    ["loyalty redemption disabled", "O resgate de pontos está desativado nesta unidade."],
    ["store unavailable", "A unidade não está disponível para vendas."],
    ["pdv sale is already processing", "Esta venda já está sendo processada. Tente finalizar novamente sem alterar os itens."],
  ];
  const lower = raw.toLocaleLowerCase("pt-BR");
  for (const [needle, message] of messages) if (lower.includes(needle)) return message;
  return "Não foi possível finalizar a venda. Revise os dados e tente novamente.";
}

export async function createPdvSaleAction(input: PosSaleInput, idempotencyKey: string) {
  try {
    const sale = await PdvService.createSale(input, idempotencyKey);
    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${sale.orderId}`);
    revalidatePath("/producao");
    revalidatePath("/crescimento");
    revalidatePath("/caixa");
    return { ok: true as const, sale, error: null };
  } catch (error) {
    return { ok: false as const, sale: null, error: friendlyPdvError(error) };
  }
}

export async function searchPdvCustomersAction(query: string) {
  try {
    if (query.trim().length < 2) return { ok: true as const, customers: [], error: null };
    return { ok: true as const, customers: await PdvService.searchCustomers(query), error: null };
  } catch {
    return { ok: false as const, customers: [], error: "Não foi possível buscar clientes agora." };
  }
}
