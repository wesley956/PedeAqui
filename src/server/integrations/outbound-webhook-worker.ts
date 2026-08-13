import "server-only";

import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSecretReference } from "@/server/fiscal/fiscal-provider";

type Delivery={ id:string;event_type:string;attempts:number;payload:Record<string,unknown> };
type ClaimRow={ delivery:Delivery;endpoint_url:string;signing_secret_ref:string };

function allowedHosts(){ return new Set((process.env.OUTBOUND_WEBHOOK_ALLOWED_HOSTS??"").split(",").map((value)=>value.trim().toLowerCase()).filter(Boolean)); }
function validateEndpoint(raw:string){ const url=new URL(raw); if(url.protocol!=="https:") throw new Error("Outbound webhook endpoint must use HTTPS"); const hosts=allowedHosts(); if(hosts.size===0) throw new Error("Outbound webhook egress allowlist is not configured"); if(!hosts.has(url.hostname.toLowerCase())) throw new Error("Outbound webhook host is not in the egress allowlist"); if(url.username||url.password) throw new Error("Outbound webhook endpoint cannot contain credentials"); return url; }
function retrySeconds(response:Response,attempts:number){ const header=response.headers.get("retry-after"); const seconds=header&&/^\d+$/.test(header)?Number(header):Math.min(3600,30*2**Math.min(attempts,6)); return Math.max(5,Math.min(seconds,3600)); }

export async function runOutboundWebhookWorker(input?:{ workerId?:string;limit?:number }){
  const admin=createAdminClient(); const workerId=input?.workerId??`outbound-webhook-${process.pid}`; const limit=Math.max(1,Math.min(input?.limit??20,100));
  const claim=await admin.rpc("integration_webhook_claim_internal",{ p_worker_id:workerId,p_limit:limit,p_lease_seconds:120 }); if(claim.error) throw claim.error;
  const rows=(claim.data??[]) as ClaimRow[];
  for(const row of rows){
    const delivery=row.delivery;
    try{
      const url=validateEndpoint(row.endpoint_url); const secret=resolveSecretReference(row.signing_secret_ref); if(!secret) throw new Error("Outbound webhook signing secret is not configured");
      const body=JSON.stringify(delivery.payload); const timestamp=Math.floor(Date.now()/1000).toString(); const signature=createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex");
      const response=await fetch(url,{ method:"POST",redirect:"manual",signal:AbortSignal.timeout(10_000),headers:{ "content-type":"application/json","user-agent":"PedeAqui-Webhook/1.0","x-pedeaqui-event":delivery.event_type,"x-pedeaqui-delivery":delivery.id,"x-pedeaqui-timestamp":timestamp,"x-pedeaqui-signature":`v1=${signature}` },body });
      const success=response.status>=200&&response.status<300;
      const finished=await admin.rpc("integration_webhook_finish_internal",{ p_delivery_id:delivery.id,p_worker_id:workerId,p_success:success,p_response_status:response.status,p_error:success?null:`HTTP ${response.status}`,p_retry_after_seconds:success?60:retrySeconds(response,delivery.attempts) }); if(finished.error) throw finished.error;
    }catch(error){ const message=error instanceof Error?error.message:String(error); const finished=await admin.rpc("integration_webhook_finish_internal",{ p_delivery_id:delivery.id,p_worker_id:workerId,p_success:false,p_response_status:null,p_error:message,p_retry_after_seconds:Math.min(3600,30*2**Math.min(delivery.attempts,6)) }); if(finished.error) throw finished.error; }
  }
  return { claimed:rows.length };
}
