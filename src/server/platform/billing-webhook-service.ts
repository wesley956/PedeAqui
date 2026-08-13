import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingProvider } from "@/server/platform/billing-provider-registry";
import { resolveBillingSecret } from "@/server/platform/billing-provider";

function sha256(value:string){ return createHash("sha256").update(value).digest("hex"); }

export async function processBillingWebhook(providerKey:string,rawBody:string,headers:Headers){
  const provider=resolveBillingProvider(providerKey);
  if(!provider) throw new Error(`Billing provider not registered: ${providerKey}`);
  const secretRef=`BILLING_${providerKey.toUpperCase().replace(/[^A-Z0-9]/g,"_")}_WEBHOOK_SECRET`;
  const context={ providerKey,secret:resolveBillingSecret(secretRef),config:{} as Record<string,unknown> };
  const verified=await provider.verifyWebhook(rawBody,headers,context);
  if(!verified) throw new Error("Invalid billing webhook signature");
  const events=await provider.parseWebhook(rawBody,headers,context);
  if(!Array.isArray(events)||events.length<1||events.length>100) throw new Error("Invalid billing webhook event count");
  const admin=createAdminClient();
  const payloadHash=sha256(rawBody);
  let processed=0;
  for(const [index,event] of events.entries()){
    const eventKey=events.length===1?event.externalEventId:`${event.externalEventId}:${index}`;
    const { data:receipt,error:receiveError }=await admin.rpc("billing_webhook_receive_internal",{
      p_provider_key:providerKey,p_external_event_id:eventKey,p_payload_hash:payloadHash,p_payload:{ event },
    });
    if(receiveError) throw receiveError;
    if(receipt?.status==="processed"){ processed+=1; continue; }
    try{
      const { error:applyError }=await admin.rpc("subscription_apply_internal",{
        p_organization_id:event.organizationId,
        p_plan_key:event.planKey,
        p_to_status:event.status,
        p_idempotency_key:`billing:${providerKey}:${eventKey}`,
        p_event_type:`billing.${event.status}`,
        p_billing_interval:event.billingInterval??"month",
        p_current_period_start:event.currentPeriodStart??null,
        p_current_period_end:event.currentPeriodEnd??null,
        p_trial_ends_at:event.trialEndsAt??null,
        p_grace_ends_at:event.graceEndsAt??null,
        p_cancel_at_period_end:event.cancelAtPeriodEnd??false,
        p_billing_provider_key:providerKey,
        p_provider_customer_id:event.providerCustomerId??null,
        p_provider_subscription_id:event.providerSubscriptionId??null,
        p_metadata:event.metadata??{},
      });
      if(applyError) throw applyError;
      const { error:finishError }=await admin.rpc("billing_webhook_finish_internal",{ p_receipt_id:receipt.id,p_success:true,p_error:null });
      if(finishError) throw finishError;
      processed+=1;
    }catch(error){
      await admin.rpc("billing_webhook_finish_internal",{ p_receipt_id:receipt.id,p_success:false,p_error:error instanceof Error?error.message:String(error) });
      throw error;
    }
  }
  return { processed };
}
