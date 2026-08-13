"use server";

import { revalidatePath } from "next/cache";
import { FinanceService } from "@/server/finance/finance-service";

export type FinanceActionState = { ok: boolean; message: string | null; error: string | null };
function text(formData: FormData,key: string) { const value=formData.get(key); return typeof value==="string" ? value.trim() : ""; }
function optional(formData: FormData,key: string) { return text(formData,key) || null; }
function refresh() { revalidatePath("/financeiro"); revalidatePath("/compras"); revalidatePath("/fornecedores"); }
function friendly(error: unknown) {
  const raw=error instanceof Error ? error.message : "Não foi possível concluir a operação financeira."; const lower=raw.toLocaleLowerCase("pt-BR");
  const rules:Array<[string,string]> = [
    ["settlement exceeds open amount","A liquidação ultrapassa o saldo em aberto."],
    ["different payload","Esta operação já foi enviada com outros dados. Atualize a tela e tente novamente."],
    ["reverse settlements before cancelling","Estorne as liquidações antes de cancelar este lançamento."],
    ["category nature does not match","A categoria escolhida não corresponde ao tipo de lançamento."],
    ["financial transfer accounts must differ","Escolha duas contas diferentes para a transferência."],
    ["financial obligation is cancelled","Este lançamento já está cancelado."],
  ];
  for (const [needle,message] of rules) if (lower.includes(needle)) return message; return raw;
}

export async function createFinanceAccountAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.createAccount({ name:text(formData,"name"),accountType:text(formData,"accountType") }); refresh(); return { ok:true,message:"Conta financeira criada.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
export async function createFinanceCategoryAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.createCategory({ name:text(formData,"name"),nature:text(formData,"nature"),dreGroup:text(formData,"dreGroup"),parentId:optional(formData,"parentId") }); refresh(); return { ok:true,message:"Categoria financeira criada.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
export async function createManualFinanceEntryAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.manualEntry({ direction:text(formData,"direction"),categoryId:text(formData,"categoryId"),amount:text(formData,"amount"),competenceDate:text(formData,"competenceDate"),dueDate:optional(formData,"dueDate"),description:text(formData,"description"),accountId:optional(formData,"accountId"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Lançamento financeiro criado.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
export async function settleFinanceObligationAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.settle({ obligationId:text(formData,"obligationId"),accountId:text(formData,"accountId"),amount:text(formData,"amount"),settledAt:optional(formData,"settledAt"),reference:optional(formData,"reference"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Liquidação registrada.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
export async function reverseFinanceSettlementAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.reverseSettlement({ transactionId:text(formData,"transactionId"),reason:text(formData,"reason"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Liquidação estornada por lançamento compensatório.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
export async function transferFinanceAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.transfer({ sourceAccountId:text(formData,"sourceAccountId"),targetAccountId:text(formData,"targetAccountId"),amount:text(formData,"amount"),occurredAt:optional(formData,"occurredAt"),reason:text(formData,"reason"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Transferência financeira registrada.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
export async function cancelManualFinanceAction(_previous: FinanceActionState,formData: FormData):Promise<FinanceActionState> {
  try { await FinanceService.cancelManual({ obligationId:text(formData,"obligationId"),reason:text(formData,"reason"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Lançamento manual cancelado com compensação.",error:null }; }
  catch(error){ return { ok:false,message:null,error:friendly(error) }; }
}
