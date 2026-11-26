"use server";
import { PdvEventService } from "@/server/pdv/events/event-service";
import type { EventCreateInput } from "@/server/pdv/events/schemas";
const failure = "Não foi possível concluir. Confira os dados e atualize os eventos antes de tentar novamente.";
export async function loadPdvEventsAction() {
  try { return { ok: true as const, data: await PdvEventService.load(), error: null }; }
  catch { return { ok: false as const, data: null, error: "Não foi possível carregar os eventos. A venda normal continua disponível." }; }
}
export async function createPdvEventAction(input: EventCreateInput, key: string) {
  try { return { ok: true as const, id: await PdvEventService.create(input, key), error: null }; } catch { return { ok: false as const, id: null, error: failure }; }
}
export async function transitionPdvEventAction(id: string, action: "activate" | "close" | "cancel", key: string) {
  try { await PdvEventService.transition(id, action, key); return { ok: true as const, error: null }; } catch { return { ok: false as const, error: failure }; }
}
export async function restockPdvEventAction(id: string, items: Array<{ productId: string; quantity: number }>, key: string) {
  try { await PdvEventService.restock(id, items, key); return { ok: true as const, error: null }; } catch { return { ok: false as const, error: failure }; }
}
export async function reportPdvEventAction(id: string) {
  try { return { ok: true as const, data: await PdvEventService.report(id), error: null }; } catch { return { ok: false as const, data: null, error: "Não foi possível consultar o relatório. Verifique sua permissão financeira." }; }
}
