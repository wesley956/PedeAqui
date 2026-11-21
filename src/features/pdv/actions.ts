"use server";

import { revalidatePath } from "next/cache";
import { friendlyPdvError } from "@/features/pdv/errors";
import { PdvService } from "@/server/pdv/pdv-service";
import type { PosSaleInput } from "@/server/pdv/schemas";


export async function createPdvSaleAction(input: PosSaleInput, idempotencyKey: string) {
  try {
    const sale = await PdvService.createSale(input, idempotencyKey);
    // A venda já foi gravada. Falha ao invalidar cache não deve transformar sucesso em erro.
    for (const path of ["/pedidos", `/pedidos/${sale.orderId}`, "/producao", "/crescimento", "/caixa"]) {
      try {
        revalidatePath(path);
      } catch {
        // Próxima navegação/reconciliação recupera o conteúdo; preservar confirmação da venda.
      }
    }
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
