"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoneyToCents } from "@/server/catalog/money";
import { CashService } from "@/server/cash/cash-service";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message.toLocaleLowerCase("pt-BR") : "";
  const rules: Array<[string, string]> = [
    ["operator already has an open cash session", "Você já possui um caixa aberto nesta unidade."],
    ["cash register already has an open session", "Este caixa já está em uso por outro turno."],
    ["cash withdrawal exceeds expected balance", "A sangria é maior que o saldo esperado em dinheiro."],
    ["cash outflow exceeds expected balance", "A saída é maior que o saldo esperado em dinheiro."],
    ["cash session is closed", "Este turno já foi fechado."],
    ["cannot disable cash register with open session", "Não é possível desativar um caixa com turno aberto."],
    ["cash register unavailable", "O caixa selecionado não está disponível."],
  ];
  for (const [needle, message] of rules) if (raw.includes(needle)) return message;
  return "Não foi possível concluir a operação de caixa.";
}

function back(kind: "ok" | "error", message: string): never {
  redirect(`/caixa?${kind}=${encodeURIComponent(message)}`);
}

export async function createCashRegisterAction(formData: FormData) {
  try {
    await CashService.createRegister({ code: text(formData, "code"), name: text(formData, "name") });
  } catch (error) {
    back("error", friendly(error));
  }
  revalidatePath("/caixa");
  back("ok", "Caixa criado.");
}

export async function updateCashRegisterAction(registerId: string, formData: FormData) {
  try {
    await CashService.updateRegister(registerId, {
      name: text(formData, "name"),
      active: formData.get("active") === "on",
    });
  } catch (error) {
    back("error", friendly(error));
  }
  revalidatePath("/caixa");
  back("ok", "Caixa atualizado.");
}

export async function openCashSessionAction(formData: FormData) {
  try {
    const openingRaw = text(formData, "openingBalance") || "0";
    await CashService.openSession({
      cashRegisterId: text(formData, "cashRegisterId"),
      openingBalanceCents: parseMoneyToCents(openingRaw),
      note: text(formData, "note") || null,
      idempotencyKey: `cash-open:${randomUUID()}`,
    });
  } catch (error) {
    back("error", friendly(error));
  }
  revalidatePath("/caixa");
  revalidatePath("/pdv");
  back("ok", "Caixa aberto para o turno.");
}

export async function cashMovementAction(type: "supply" | "withdrawal", sessionId: string, formData: FormData) {
  try {
    await CashService.manualMovement({
      sessionId,
      type,
      amountCents: parseMoneyToCents(formData.get("amount")),
      reason: text(formData, "reason"),
      idempotencyKey: `cash-${type}:${randomUUID()}`,
    });
  } catch (error) {
    back("error", friendly(error));
  }
  revalidatePath("/caixa");
  back("ok", type === "supply" ? "Suprimento registrado." : "Sangria registrada.");
}

export async function closeCashSessionAction(sessionId: string, formData: FormData) {
  try {
    await CashService.closeSession({
      sessionId,
      countedCashCents: parseMoneyToCents(formData.get("countedCash")),
      note: text(formData, "note") || null,
      idempotencyKey: `cash-close:${randomUUID()}`,
    });
  } catch (error) {
    back("error", friendly(error));
  }
  revalidatePath("/caixa");
  revalidatePath("/pdv");
  back("ok", "Turno fechado e conferido.");
}
