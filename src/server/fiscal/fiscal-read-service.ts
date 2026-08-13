import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize,AuthorizationError } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";

function permission(value:string){ return value as PermissionKey; }
function requireStore(storeId:string|null){ if(!storeId) throw new Error("Uma unidade ativa é necessária"); return storeId; }
async function can(key:string,context:Awaited<ReturnType<typeof authorize>>){ try{ await authorize(permission(key),context); return true; }catch(error){ if(error instanceof AuthorizationError) return false; throw error; } }

export class FiscalReadService {
  static async load(){
    const context=await authorize(permission("fiscal.view")); const storeId=requireStore(context.storeId); const admin=createAdminClient();
    const [canManage,canIssue,canCancel,canManageIntegrations]=await Promise.all([can("fiscal.manage",context),can("fiscal.issue",context),can("fiscal.cancel",context),can("integrations.manage",context)]);
    const [storeResult,integrationsResult,profileResult,documentsResult,jobsResult,ordersResult,productsResult,profilesResult]=await Promise.all([
      admin.from("stores").select("id,name,document,timezone").eq("id",storeId).eq("organization_id",context.organizationId).single(),
      admin.from("integrations").select("id,provider_key,name,environment,secret_ref,webhook_secret_ref,capabilities,active,updated_at").eq("organization_id",context.organizationId).eq("store_id",storeId).eq("kind","fiscal").eq("active",true).order("name"),
      admin.from("fiscal_profiles").select("id,integration_id,issuer_tax_id,state_registration,municipal_registration,crt_code,default_document_model,environment,certificate_ref,emission_policy,active,updated_at").eq("organization_id",context.organizationId).eq("store_id",storeId).maybeSingle(),
      admin.from("fiscal_documents").select("id,order_id,integration_id,model,environment,status,series,document_number,access_key,protocol,cancellation_protocol,rejection_code,rejection_message,xml_storage_path,danfe_storage_path,queued_at,processing_at,authorized_at,rejected_at,cancelled_at,contingency_at,created_at,updated_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("created_at",{ ascending:false }).limit(120),
      admin.from("fiscal_jobs").select("id,fiscal_document_id,integration_id,job_type,status,attempts,max_attempts,available_at,leased_at,lease_expires_at,last_error,created_at,completed_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("created_at",{ ascending:false }).limit(120),
      admin.from("orders").select("id,display_number,order_status,payment_status,total_cents,customer_name_snapshot,confirmed_at,completed_at,created_at").eq("organization_id",context.organizationId).eq("store_id",storeId).in("order_status",["confirmed","completed"]).order("created_at",{ ascending:false }).limit(80),
      admin.from("products").select("id,name,active,availability").eq("organization_id",context.organizationId).eq("store_id",storeId).is("deleted_at",null).order("name"),
      admin.from("product_fiscal_profiles").select("id,product_id,version,effective_at,ncm,cest,default_cfop,cst_csosn,cclass_trib,created_at").eq("organization_id",context.organizationId).eq("store_id",storeId).order("version",{ ascending:false }),
    ]);
    for(const result of [storeResult,integrationsResult,profileResult,documentsResult,jobsResult,ordersResult,productsResult,profilesResult]) if(result.error) throw result.error;
    type ProductFiscalRow=NonNullable<typeof profilesResult.data>[number];
    const latestByProduct=new Map<string,ProductFiscalRow>();
    for(const row of profilesResult.data??[]) if(!latestByProduct.has(row.product_id)) latestByProduct.set(row.product_id,row);
    const documents=documentsResult.data??[]; const jobs=jobsResult.data??[];
    const documentOrderIds=new Set(documents.map((d)=>d.order_id).filter((id):id is string=>Boolean(id)));
    const eligibleOrders=(ordersResult.data??[]).filter((o)=>!documentOrderIds.has(o.id));
    const staleBefore=Date.now()-10*60_000;
    const health={
      rejected:documents.filter((d)=>d.status==="rejected").length,
      contingency:documents.filter((d)=>d.status==="contingency").length,
      stale:documents.filter((d)=>["queued","processing","contingency"].includes(d.status)&&new Date(d.updated_at).getTime()<staleBefore).length,
      deadJobs:jobs.filter((job)=>job.status==="dead").length,
      missingArtifacts:documents.filter((d)=>["authorized","cancelled"].includes(d.status)&&!d.xml_storage_path).length,
      productsWithoutFiscalProfile:(productsResult.data??[]).filter((product)=>product.active&&!latestByProduct.has(product.id)).length,
    };
    return {
      context,storeId,store:storeResult.data,integrations:integrationsResult.data??[],profile:profileResult.data??null,
      documents,jobs,eligibleOrders,health,
      products:(productsResult.data??[]).map((product)=>({ ...product,fiscalProfile:latestByProduct.get(product.id)??null })),
      canManage,canIssue,canCancel,canManageIntegrations,
    };
  }
}
