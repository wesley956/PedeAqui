import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize,AuthorizationError } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";

const dateText=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function permission(value:string){ return value as PermissionKey; }
function requireStore(storeId:string|null){ if(!storeId) throw new Error("Uma unidade ativa é necessária"); return storeId; }
async function can(key:string,context:Awaited<ReturnType<typeof authorize>>){ try{ await authorize(permission(key),context); return true; } catch(error){ if(error instanceof AuthorizationError) return false; throw error; } }
function dateParts(timeZone:string){ const parts=new Intl.DateTimeFormat("en-CA",{ timeZone,year:"numeric",month:"2-digit",day:"2-digit" }).formatToParts(new Date()); const map=Object.fromEntries(parts.map((p)=>[p.type,p.value])); return { year:map.year!,month:map.month!,day:map.day! }; }
function period(timeZone:string,input?:{ from?:string|null;to?:string|null }){ const now=dateParts(timeZone); const from=input?.from?dateText.parse(input.from):`${now.year}-${now.month}-01`; const to=input?.to?dateText.parse(input.to):`${now.year}-${now.month}-${now.day}`; const a=new Date(`${from}T00:00:00Z`); const b=new Date(`${to}T00:00:00Z`); if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||a>b||(b.getTime()-a.getTime())/86400000>400) throw new Error("Período financeiro inválido"); return { from,to,today:`${now.year}-${now.month}-${now.day}` }; }

export class FinanceReadService {
  static async load(input?:{ from?:string|null;to?:string|null }){
    const context=await authorize(permission("finance.view")); const storeId=requireStore(context.storeId); const admin=createAdminClient();
    const storeResult=await admin.from("stores").select("id,name,timezone").eq("id",storeId).eq("organization_id",context.organizationId).single(); if(storeResult.error) throw storeResult.error;
    const selectedPeriod=period(storeResult.data.timezone||"America/Sao_Paulo",input);
    const [canManage,canSettle,canReports]=await Promise.all([can("finance.manage",context),can("finance.settle",context),can("finance.reports",context)]);
    const [accountsResult,balancesResult,categoriesResult,obligationsResult,transactionsResult,suppliersResult,supplierStoresResult]=await Promise.all([
      admin.from("financial_accounts").select("id,name,account_type,system_key,active").eq("organization_id",context.organizationId).eq("store_id",storeId).eq("active",true).is("deleted_at",null).order("name"),
      admin.from("financial_account_balances").select("account_id,balance_cents,updated_at").eq("organization_id",context.organizationId),
      admin.from("financial_categories").select("id,parent_id,name,nature,dre_group,system_key,active").eq("organization_id",context.organizationId).eq("active",true).is("deleted_at",null).order("name"),
      admin.from("financial_obligations").select("id,direction,obligation_type,source_type,source_id,counterparty_type,counterparty_id,description,competence_date,due_date,principal_cents,settled_cents,open_cents,status,cancelled_reason,created_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("due_date",{ ascending:true }).limit(180),
      admin.from("financial_transactions").select("id,obligation_id,account_id,category_id,transaction_type,direction,effect_sign,amount_cents,competence_date,source_type,source_id,transfer_group_id,description,metadata,occurred_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("occurred_at",{ ascending:false }).limit(180),
      admin.from("suppliers").select("id,name").eq("organization_id",context.organizationId).eq("active",true).is("deleted_at",null).order("name"),
      admin.from("supplier_stores").select("supplier_id,active,payment_term_days").eq("organization_id",context.organizationId).eq("store_id",storeId),
    ]);
    for(const result of [accountsResult,balancesResult,categoriesResult,obligationsResult,transactionsResult,suppliersResult,supplierStoresResult]) if(result.error) throw result.error;
    const balanceMap=new Map((balancesResult.data??[]).map((row)=>[row.account_id,row]));
    const accounts=(accountsResult.data??[]).map((account)=>({ ...account,balance_cents:balanceMap.get(account.id)?.balance_cents??0 }));
    const supplierConfigMap=new Map((supplierStoresResult.data??[]).map((row)=>[row.supplier_id,row]));
    const suppliers=(suppliersResult.data??[]).map((supplier)=>({ ...supplier,config:supplierConfigMap.get(supplier.id)??null }));
    let report:unknown=null;
    if(canReports){ const reportResult=await admin.rpc("financial_report_internal",{ p_store_id:storeId,p_from:selectedPeriod.from,p_to:selectedPeriod.to }); if(reportResult.error) throw reportResult.error; report=reportResult.data; }
    return { context,storeId,store:storeResult.data,period:selectedPeriod,accounts,categories:categoriesResult.data??[],obligations:obligationsResult.data??[],transactions:transactionsResult.data??[],suppliers,report,canManage,canSettle,canReports };
  }
}
