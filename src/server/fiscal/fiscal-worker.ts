import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FiscalDocumentEnvelope,FiscalProviderContext,FiscalProviderResolver } from "@/server/fiscal/fiscal-provider";
import { resolveSecretReference } from "@/server/fiscal/fiscal-provider";

type ClaimedJob={ id:string;organization_id:string;store_id:string;fiscal_document_id:string;integration_id:string;job_type:"issue"|"query"|"cancel";attempts:number;payload:Record<string,unknown> };

type DocumentRow={ id:string;status:string;provider_document_id:string|null;issuer_snapshot:Record<string,unknown>;customer_snapshot:Record<string,unknown>;totals_snapshot:Record<string,unknown>;fiscal_payload:Record<string,unknown>;model:string;environment:string;access_key:string|null;protocol:string|null };
type IntegrationRow={ id:string;provider_key:string;environment:"sandbox"|"homologation"|"production";secret_ref:string|null;config:Record<string,unknown>;active:boolean };

function transitionKey(job:ClaimedJob,status:string){ return `fiscal-worker:${job.id}:${job.attempts}:${status}`; }

async function transition(admin:ReturnType<typeof createAdminClient>,job:ClaimedJob,status:string,input?:{ code?:string|null;message?:string|null;accessKey?:string|null;protocol?:string|null;cancellationProtocol?:string|null;metadata?:Record<string,unknown> }){
  const { error }=await admin.rpc("fiscal_transition_internal",{ p_fiscal_document_id:job.fiscal_document_id,p_to_status:status,p_idempotency_key:transitionKey(job,status),p_event_type:`fiscal.${status}`,p_provider_code:input?.code??null,p_message:input?.message??null,p_access_key:input?.accessKey??null,p_protocol:input?.protocol??null,p_cancellation_protocol:input?.cancellationProtocol??null,p_actor_user_id:null,p_metadata:input?.metadata??{} }); if(error) throw error;
}

async function finish(admin:ReturnType<typeof createAdminClient>,job:ClaimedJob,workerId:string,success:boolean,error?:unknown){ const message=error instanceof Error?error.message:String(error??""); const { error:rpcError }=await admin.rpc("fiscal_finish_job_internal",{ p_job_id:job.id,p_worker_id:workerId,p_success:success,p_error:success?null:message,p_retry_after_seconds:Math.min(900,Math.max(15,15*2**Math.min(job.attempts,6))) }); if(rpcError) throw rpcError; }

async function loadEnvelope(admin:ReturnType<typeof createAdminClient>,job:ClaimedJob){
  const [documentResult,itemsResult,integrationResult]=await Promise.all([
    admin.from("fiscal_documents").select("id,status,provider_document_id,issuer_snapshot,customer_snapshot,totals_snapshot,fiscal_payload,model,environment,access_key,protocol").eq("id",job.fiscal_document_id).eq("organization_id",job.organization_id).eq("store_id",job.store_id).single(),
    admin.from("fiscal_items").select("id,line_number,description,quantity,unit_price_cents,total_cents,fiscal_snapshot,product_id,order_item_id").eq("fiscal_document_id",job.fiscal_document_id).eq("organization_id",job.organization_id).eq("store_id",job.store_id).order("line_number"),
    admin.from("integrations").select("id,provider_key,environment,secret_ref,config,active").eq("id",job.integration_id).eq("organization_id",job.organization_id).eq("store_id",job.store_id).eq("kind","fiscal").single(),
  ]);
  if(documentResult.error) throw documentResult.error; if(itemsResult.error) throw itemsResult.error; if(integrationResult.error) throw integrationResult.error;
  const document=documentResult.data as DocumentRow; const integration=integrationResult.data as IntegrationRow;
  if(!integration.active) throw new Error("Fiscal integration is inactive");
  const envelope:FiscalDocumentEnvelope={ document:{ ...document,idempotencyKey:`fiscal-document:${document.id}` },items:(itemsResult.data??[]) as Array<Record<string,unknown>> };
  const context:FiscalProviderContext={ providerKey:integration.provider_key,environment:integration.environment,secret:resolveSecretReference(integration.secret_ref),config:integration.config??{} };
  return { document,integration,envelope,context };
}

async function processJob(admin:ReturnType<typeof createAdminClient>,job:ClaimedJob,workerId:string,resolver:FiscalProviderResolver){
  try{
    const { document,integration,envelope,context }=await loadEnvelope(admin,job);
    const provider=resolver(integration.provider_key); if(!provider||provider.key!==integration.provider_key) throw new Error(`Fiscal provider not registered: ${integration.provider_key}`);
    if(job.job_type==="issue"){
      if(document.status==="authorized"||document.status==="cancelled"){ await finish(admin,job,workerId,true); return; }
      const result=await provider.issue(envelope,context);
      if(result.providerDocumentId){ const update=await admin.from("fiscal_documents").update({ provider_document_id:result.providerDocumentId,updated_at:new Date().toISOString() }).eq("id",job.fiscal_document_id).eq("organization_id",job.organization_id).eq("store_id",job.store_id); if(update.error) throw update.error; }
      let currentStatus=document.status;
      if(result.status==="contingency"){ if(currentStatus==="queued"||currentStatus==="processing") await transition(admin,job,"contingency",{ code:result.code,message:result.message,metadata:{ provider_document_id:result.providerDocumentId??null } }); }
      else {
        if(currentStatus==="queued"){ await transition(admin,job,"processing",{ code:result.code,message:result.message,metadata:{ provider_document_id:result.providerDocumentId??null } }); currentStatus="processing"; }
        if(result.status==="authorized"&&currentStatus==="processing") await transition(admin,job,"authorized",{ code:result.code,message:result.message,accessKey:result.accessKey,protocol:result.protocol,metadata:{ provider_document_id:result.providerDocumentId??null } });
        else if(result.status==="rejected"&&currentStatus==="processing") await transition(admin,job,"rejected",{ code:result.code,message:result.message,metadata:{ provider_document_id:result.providerDocumentId??null } });
      }
      await finish(admin,job,workerId,true); return;
    }
    if(job.job_type==="cancel"){
      if(document.status==="cancelled"){ await finish(admin,job,workerId,true); return; }
      if(document.status!=="authorized") throw new Error("Fiscal document is not authorized for cancellation");
      const reason=typeof job.payload?.reason==="string"?job.payload.reason:"Cancelamento solicitado";
      const result=await provider.cancel({ ...envelope,reason },context);
      await transition(admin,job,"cancelled",{ code:result.code,message:result.message??reason,cancellationProtocol:result.cancellationProtocol });
      await finish(admin,job,workerId,true); return;
    }
    throw new Error("Fiscal query job is not supported by the configured adapter contract yet");
  }catch(error){ await finish(admin,job,workerId,false,error); }
}

export async function runFiscalWorker(resolver:FiscalProviderResolver,input?:{ workerId?:string;limit?:number }){
  const admin=createAdminClient(); const workerId=input?.workerId??`fiscal-worker-${process.pid}`; const limit=Math.max(1,Math.min(input?.limit??10,50));
  const { data,error }=await admin.rpc("fiscal_claim_jobs_internal",{ p_worker_id:workerId,p_limit:limit,p_lease_seconds:120 }); if(error) throw error;
  const jobs=(data??[]) as ClaimedJob[];
  for(const job of jobs) await processJob(admin,job,workerId,resolver);
  return { claimed:jobs.length };
}
