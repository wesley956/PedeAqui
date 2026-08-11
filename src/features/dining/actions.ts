"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DiningService } from "@/server/dining/dining-service";
import { PublicDiningService } from "@/server/dining/public-dining-service";
import type { DiningRoundInput } from "@/server/dining/schemas";
import { parsePosMoneyToCents } from "@/features/pdv/model";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function optional(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}
function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  const rules: Array<[string, string]> = [
    ["active tab already exists", "Esta mesa já possui uma comanda ativa."],
    ["target table unavailable", "A mesa de destino não está disponível."],
    ["tab still has outstanding balance", "Ainda existe saldo em aberto na comanda."],
    ["tab has unfinished orders", "Ainda existem pedidos em produção ou não servidos."],
    ["payment exceeds tab member balance", "O valor ultrapassa o saldo desta pessoa."],
    ["payment exceeds tab balance", "O valor ultrapassa o saldo da comanda."],
    ["payment method disabled", "A forma de pagamento está desativada nesta unidade."],
    ["product unavailable", "Um item ficou indisponível. Atualize e revise a rodada."],
    ["modifier", "Revise os adicionais da rodada."],
    ["qr", "O pedido por QR desta mesa não está disponível."],
  ];
  for (const [needle, message] of rules) if (raw.includes(needle)) return message;
  return "Não foi possível concluir a operação do salão.";
}

export async function createDiningTableAction(formData: FormData) {
  await DiningService.createTable({
    code: text(formData, "code"), name: text(formData, "name"), capacity: Number(text(formData, "capacity") || "4"),
    area: optional(formData, "area"), qrEnabled: formData.get("qrEnabled") === "on",
  });
  revalidatePath("/salao"); redirect("/salao");
}

export async function openDiningTabAction(tableId: string, formData: FormData) {
  await DiningService.openTab(tableId, Number(text(formData, "guestCount") || "1"), optional(formData, "label"));
  revalidatePath("/salao"); revalidatePath(`/salao/${tableId}`); redirect(`/salao/${tableId}`);
}

export async function setDiningTableStatusAction(tableId: string, formData: FormData) {
  await DiningService.setTableStatus(tableId, text(formData, "status"));
  revalidatePath("/salao"); revalidatePath(`/salao/${tableId}`); redirect(`/salao/${tableId}`);
}

export async function rotateDiningQrAction(tableId: string) {
  await DiningService.rotateQr(tableId); revalidatePath(`/salao/${tableId}`); redirect(`/salao/${tableId}`);
}

export async function transferDiningTabAction(tabId: string, sourceTableId: string, formData: FormData) {
  const target = text(formData, "targetTableId");
  await DiningService.transferTab(tabId, target);
  revalidatePath("/salao"); revalidatePath(`/salao/${sourceTableId}`); revalidatePath(`/salao/${target}`); redirect(`/salao/${target}`);
}

export async function addDiningMemberAction(tabId: string, tableId: string, formData: FormData) {
  await DiningService.addMember(tabId, { name: text(formData, "name"), seatNumber: text(formData, "seatNumber") ? Number(text(formData, "seatNumber")) : null });
  revalidatePath(`/salao/${tableId}`); redirect(`/salao/${tableId}`);
}

export async function allocateDiningItemAction(tabId: string, tableId: string, formData: FormData) {
  await DiningService.allocateItem(tabId, text(formData, "orderItemId"), text(formData, "memberId"), Number(text(formData, "quantity") || "1"));
  revalidatePath(`/salao/${tableId}`); redirect(`/salao/${tableId}`);
}

export async function setDiningTabStatusAction(tabId: string, tableId: string, status: "settling" | "closed" | "canceled", formData?: FormData) {
  await DiningService.setTabStatus(tabId, status, formData ? optional(formData, "reason") : null);
  revalidatePath("/salao"); revalidatePath(`/salao/${tableId}`); redirect(`/salao/${tableId}`);
}

export async function payDiningTabAction(tabId: string, tableId: string, formData: FormData) {
  const amount = parsePosMoneyToCents(text(formData, "amount"));
  if (!amount || amount <= 0) throw new Error("Valor inválido");
  const cashText = text(formData, "cashTendered");
  const cash = cashText ? parsePosMoneyToCents(cashText) : null;
  await DiningService.payTab(tabId, {
    amountCents: amount,
    method: text(formData, "method") as "cash" | "pix" | "credit_card" | "debit_card",
    cashTenderedCents: cash,
    reference: optional(formData, "reference"),
    tabMemberId: optional(formData, "tabMemberId"),
  }, crypto.randomUUID());
  revalidatePath("/salao"); revalidatePath(`/salao/${tableId}`); revalidatePath("/pedidos"); redirect(`/salao/${tableId}`);
}

export async function createDiningRoundAction(tabId: string, input: DiningRoundInput, idempotencyKey: string) {
  try {
    const round = await DiningService.createRound(tabId, input, idempotencyKey);
    revalidatePath("/salao"); revalidatePath("/pedidos"); revalidatePath("/producao");
    return { ok: true as const, round, error: null };
  } catch (error) {
    return { ok: false as const, round: null, error: friendly(error) };
  }
}

export async function createQrRoundAction(publicCode: string, input: DiningRoundInput, idempotencyKey: string) {
  try {
    const round = await PublicDiningService.createRound(publicCode, input, idempotencyKey);
    return { ok: true as const, round, error: null };
  } catch (error) {
    return { ok: false as const, round: null, error: friendly(error) };
  }
}
