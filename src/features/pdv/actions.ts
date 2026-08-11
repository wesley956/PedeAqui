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
    ["payment total does not match order total", "Os pagamentos não fecham com o total atual do pedido."],
    ["cash received is below payment amount", "O valor recebido em dinheiro é menor que a parcela."],
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
    return { ok: true as const, sale, error: null };
  } catch (error) {
    return { ok: false as const, sale: null, error: friendlyPdvError(error) };
  }
}
