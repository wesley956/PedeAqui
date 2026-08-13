import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";
import { parseMoneyToCents } from "@/server/catalog/money";

const uuid = z.string().uuid();
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountType = z.enum(["cash","bank","clearing","wallet","other"]);
const nature = z.enum(["revenue","expense"]);
const dreGroup = z.enum(["gross_revenue","deductions","delivery_revenue","cogs","operating_expense","other_revenue","other_expense"]);

type Context = Awaited<ReturnType<typeof authorize>>;
function permission(value: string) { return value as PermissionKey; }
function requireStore(storeId: string | null) { if (!storeId) throw new Error("Uma unidade ativa é necessária"); return storeId; }
async function can(key: string, context: Context) {
  try { await authorize(permission(key), context); return true; }
  catch (error) { if (error instanceof AuthorizationError) return false; throw error; }
}
function dateParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type,part.value]));
  return { year: map.year!, month: map.month!, day: map.day! };
}
function normalizePeriod(timeZone: string, input?: { from?: string | null; to?: string | null }) {
  const now = dateParts(timeZone); const fallbackTo = `${now.year}-${now.month}-${now.day}`; const fallbackFrom = `${now.year}-${now.month}-01`;
  const from = input?.from ? dateText.parse(input.from) : fallbackFrom; const to = input?.to ? dateText.parse(input.to) : fallbackTo;
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error("Período financeiro inválido");
  if ((end.getTime()-start.getTime()) / 86400000 > 400) throw new Error("O período financeiro não pode ultrapassar 400 dias");
  return { from, to };
}
async function scopedAccount(admin: ReturnType<typeof createAdminClient>, context: Context, storeId: string, accountId: string) {
  const id = uuid.parse(accountId);
  const { data,error } = await admin.from("financial_accounts").select("id,organization_id,store_id,active").eq("id",id).eq("organization_id",context.organizationId).eq("store_id",storeId).eq("active",true).is("deleted_at",null).maybeSingle();
  if (error) throw error; if (!data) throw new Error("Conta financeira fora da unidade ativa"); return id;
}

export class FinanceService {
  static async load(input?: { from?: string | null; to?: string | null }) {
    const context = await authorize(permission("finance.view")); const storeId = requireStore(context.storeId); const admin = createAdminClient();
    const storeResult = await admin.from("stores").select("id,name,timezone").eq("id",storeId).eq("organization_id",context.organizationId).single();
    if (storeResult.error) throw storeResult.error;
    const period = normalizePeriod(storeResult.data.timezone || "America/Sao_Paulo", input);
    const [reportResult,categoriesResult,obligationsResult,transactionsResult,canManage,canSettle,canReports] = await Promise.all([
      admin.rpc("financial_report_internal", { p_store_id: storeId, p_from: period.from, p_to: period.to }),
      admin.from("financial_categories").select("id,parent_id,name,nature,dre_group,system_key,active").eq("organization_id",context.organizationId).eq("active",true).is("deleted_at",null).order("name"),
      admin.from("financial_obligations").select("id,direction,obligation_type,source_type,source_id,counterparty_type,counterparty_id,description,competence_date,due_date,principal_cents,settled_cents,open_cents,status,cancelled_reason,created_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("due_date",{ ascending: true }).limit(180),
      admin.from("financial_transactions").select("id,obligation_id,account_id,category_id,transaction_type,direction,effect_sign,amount_cents,competence_date,source_type,source_id,transfer_group_id,description,metadata,occurred_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("occurred_at",{ ascending: false }).limit(180),
      can("finance.manage",context), can("finance.settle",context), can("finance.reports",context),
    ]);
    for (const result of [reportResult,categoriesResult,obligationsResult,transactionsResult]) if (result.error) throw result.error;
    return { context,storeId,store:storeResult.data,period,report:reportResult.data,categories:categoriesResult.data ?? [],obligations:obligationsResult.data ?? [],transactions:transactionsResult.data ?? [],canManage,canSettle,canReports };
  }

  static async createAccount(input: { name: string; accountType: string }) {
    const context = await authorize(permission("finance.manage")); const storeId=requireStore(context.storeId); const admin=createAdminClient();
    const { data,error } = await admin.rpc("financial_create_account_internal", { p_store_id:storeId,p_name:input.name.trim(),p_account_type:accountType.parse(input.accountType),p_actor_user_id:context.userId });
    if (error) throw error; return data;
  }

  static async createCategory(input: { name: string; nature: string; dreGroup: string; parentId?: string | null }) {
    const context = await authorize(permission("finance.manage")); const admin=createAdminClient();
    const parentId=input.parentId ? uuid.parse(input.parentId) : null;
    if (parentId) { const scoped=await admin.from("financial_categories").select("id").eq("id",parentId).eq("organization_id",context.organizationId).eq("active",true).is("deleted_at",null).maybeSingle(); if (scoped.error) throw scoped.error; if (!scoped.data) throw new Error("Categoria pai fora da organização"); }
    const { data,error } = await admin.rpc("financial_create_category_internal", { p_organization_id:context.organizationId,p_name:input.name.trim(),p_nature:nature.parse(input.nature),p_dre_group:dreGroup.parse(input.dreGroup),p_parent_id:parentId,p_actor_user_id:context.userId });
    if (error) throw error; return data;
  }

  static async manualEntry(input: { direction: string; categoryId: string; amount: string; competenceDate: string; dueDate?: string | null; description: string; accountId?: string | null; idempotencyKey: string }) {
    const context=await authorize(permission("finance.manage")); const storeId=requireStore(context.storeId); const admin=createAdminClient();
    const direction=z.enum(["in","out"]).parse(input.direction); const categoryId=uuid.parse(input.categoryId); const competenceDate=dateText.parse(input.competenceDate); const dueDate=input.dueDate ? dateText.parse(input.dueDate) : competenceDate; const amount=parseMoneyToCents(input.amount);
    const cat=await admin.from("financial_categories").select("id,nature").eq("id",categoryId).eq("organization_id",context.organizationId).eq("active",true).is("deleted_at",null).maybeSingle(); if (cat.error) throw cat.error; if (!cat.data) throw new Error("Categoria financeira indisponível");
    if ((direction==="in" && cat.data.nature!=="revenue") || (direction==="out" && cat.data.nature!=="expense")) throw new Error("A natureza da categoria não corresponde ao lançamento");
    let accountId:string|null=null;
    if (input.accountId) { await authorize(permission("finance.settle"),context); accountId=await scopedAccount(admin,context,storeId,input.accountId); }
    const { data,error }=await admin.rpc("financial_manual_entry_internal", { p_store_id:storeId,p_direction:direction,p_category_id:categoryId,p_amount_cents:amount,p_competence_date:competenceDate,p_due_date:dueDate,p_description:input.description.trim(),p_account_id:accountId,p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId });
    if (error) throw error; return data;
  }

  static async settle(input: { obligationId: string; accountId: string; amount: string; settledAt?: string | null; reference?: string | null; idempotencyKey: string }) {
    const context=await authorize(permission("finance.settle")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const obligationId=uuid.parse(input.obligationId); const accountId=await scopedAccount(admin,context,storeId,input.accountId);
    const ob=await admin.from("financial_obligations").select("id,open_cents,status").eq("id",obligationId).eq("organization_id",context.organizationId).eq("store_id",storeId).maybeSingle(); if (ob.error) throw ob.error; if (!ob.data) throw new Error("Obrigação fora da unidade ativa");
    const { data,error }=await admin.rpc("financial_settle_obligation_internal", { p_obligation_id:obligationId,p_account_id:accountId,p_amount_cents:parseMoneyToCents(input.amount),p_settled_at:input.settledAt || null,p_reference:input.reference?.trim() || null,p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId });
    if (error) throw error; return data;
  }

  static async reverseSettlement(input: { transactionId: string; reason: string; idempotencyKey: string }) {
    const context=await authorize(permission("finance.settle")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const transactionId=uuid.parse(input.transactionId);
    const tx=await admin.from("financial_transactions").select("id").eq("id",transactionId).eq("organization_id",context.organizationId).eq("store_id",storeId).eq("transaction_type","settlement").maybeSingle(); if (tx.error) throw tx.error; if (!tx.data) throw new Error("Liquidação fora da unidade ativa");
    const { data,error }=await admin.rpc("financial_reverse_settlement_internal", { p_transaction_id:transactionId,p_reason:input.reason.trim(),p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId }); if (error) throw error; return data;
  }

  static async transfer(input: { sourceAccountId: string; targetAccountId: string; amount: string; occurredAt?: string | null; reason: string; idempotencyKey: string }) {
    const context=await authorize(permission("finance.settle")); const storeId=requireStore(context.storeId); const admin=createAdminClient();
    const sourceAccountId=await scopedAccount(admin,context,storeId,input.sourceAccountId); const targetAccountId=await scopedAccount(admin,context,storeId,input.targetAccountId);
    const { data,error }=await admin.rpc("financial_transfer_internal", { p_source_account_id:sourceAccountId,p_target_account_id:targetAccountId,p_amount_cents:parseMoneyToCents(input.amount),p_occurred_at:input.occurredAt || null,p_reason:input.reason.trim(),p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId }); if (error) throw error; return data;
  }

  static async cancelManual(input: { obligationId: string; reason: string; idempotencyKey: string }) {
    const context=await authorize(permission("finance.manage")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const obligationId=uuid.parse(input.obligationId);
    const ob=await admin.from("financial_obligations").select("id,source_type").eq("id",obligationId).eq("organization_id",context.organizationId).eq("store_id",storeId).maybeSingle(); if (ob.error) throw ob.error; if (!ob.data || ob.data.source_type!=="manual") throw new Error("Somente lançamento manual desta unidade pode ser cancelado aqui");
    const { data,error }=await admin.rpc("financial_cancel_manual_obligation_internal", { p_obligation_id:obligationId,p_reason:input.reason.trim(),p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId }); if (error) throw error; return data;
  }
}
