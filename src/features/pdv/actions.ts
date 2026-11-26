"use server";

import { revalidatePath } from "next/cache";
import { friendlyPdvError } from "@/features/pdv/errors";
import { PdvService } from "@/server/pdv/pdv-service";
import type { PosSaleInput } from "@/server/pdv/schemas";


export async function createPdvSaleAction(input: PosSaleInput, idempotencyKey: string) {
  const startedAt = performance.now();
  let saleDurationMs: number | null = null;
  try {
    const sale = await PdvService.createSale(input, idempotencyKey);
    saleDurationMs = Math.round(performance.now() - startedAt);
    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${sale.orderId}`);
    revalidatePath("/producao");
    revalidatePath("/crescimento");
    revalidatePath("/caixa");
    return { ok: true as const, sale, error: null };
  } catch (error) {
    return { ok: false as const, sale: null, error: friendlyPdvError(error) };
  } finally {
    const totalMs = Math.round(performance.now() - startedAt);
    if (process.env.PDV_TIMING_DIAGNOSTICS === "1") {
      console.info(JSON.stringify({ event: "pdv.sale.timing", totalMs, saleDurationMs, postSaleMs: saleDurationMs === null ? null : Math.max(0, totalMs - saleDurationMs) }));
    }
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
