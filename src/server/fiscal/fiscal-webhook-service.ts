import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FiscalProviderResolver } from "@/server/fiscal/fiscal-provider";
import { resolveSecretReference } from "@/server/fiscal/fiscal-provider";

export class FiscalWebhookService {
  static async ingest(integrationId:string,rawBody:string,headers:Headers,resolver:FiscalProviderResolver){
    const admin=createAdminClient();
    const integrationResult=await admin.from("integrations").select("id,organization_id,store_id,provider_key,environment,secret_ref,webhook_secret_ref,config,active").eq("id",integrationId).eq("kind","fiscal").eq("active",true).single();
    if(integrationResult.error) throw integrationResult.error;
    const integration=integrationResult.data;
    const provider=resolver(integration.provider_key); if(!provider||provider.key!==integration.provider_key) throw new Error("Fiscal provider is not registered");
    if(!provider.verifyWebhook||!provider.parseWebhook) throw new Error("Fiscal provider does not support webhooks");
    const webhookRef=integration.webhook_secret_ref??integration.secret_ref;
    const context={ providerKey:integration.provider_key,environment:integration.environment as "sandbox"|"homologation"|"production",secret:resolveSecretReference(webhookRef),config:(integration.config??{}) as Record<string,unknown> };
    if(!context.secret) throw new Error("Fiscal webhook secret is not configured");
    const verified=await provider.verifyWebhook(rawBody,headers,context); if(!verified) throw new Error("Invalid fiscal webhook signature");
    const events=await provider.parseWebhook(rawBody,headers,context);
    if(events.length>100) throw new Error("Fiscal webhook event limit exceeded");
    const bodyHash=createHash("sha256").update(rawBody).digest("hex");
    for(const event of events){
      const eventHash=createHash("sha256").update(`${bodyHash}:${event.externalEventId}:${event.status}`).digest("hex");
      const { error }=await admin.rpc("fiscal_apply_webhook_internal",{
        p_integration_id:integration.id,p_external_event_id:event.externalEventId,p_payload_sha256:eventHash,p_provider_document_id:event.providerDocumentId??null,p_access_key:event.accessKey??null,p_target_status:event.status,p_protocol:event.protocol??null,p_cancellation_protocol:event.cancellationProtocol??null,p_provider_code:event.code??null,p_message:event.message??null,p_metadata:event.metadata??{},
      });
      if(error) throw error;
    }
    return { processed:events.length };
  }
}
