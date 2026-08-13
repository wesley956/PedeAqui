import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";

const uuid=z.string().uuid();
const model=z.enum(["55","65"]);
const integrationEnvironment=z.enum(["sandbox","homologation","production"]);
const fiscalEnvironment=z.enum(["homologation","production"]);
const emissionPolicy=z.enum(["manual","on_payment","on_completion"]);
function permission(value:string){ return value as PermissionKey; }
function requireStore(storeId:string|null){ if(!storeId) throw new Error("Uma unidade ativa é necessária"); return storeId; }
async function scoped<T extends { id:string }>(query:PromiseLike<{ data:T|null;error:unknown }>,message:string){ const result=await query; if(result.error) throw result.error; if(!result.data) throw new Error(message); return result.data; }

export class FiscalService {
  static async configureIntegration(input:{ providerKey:string;name:string;environment:string;secretRef?:string|null;webhookSecretRef?:string|null;capabilities?:string[] }){
    const context=await authorize(permission("integrations.manage")); const storeId=requireStore(context.storeId); const admin=createAdminClient();
    const { data,error }=await admin.rpc("fiscal_configure_integration_internal",{
      p_store_id:storeId,p_provider_key:input.providerKey.trim(),p_name:input.name.trim(),p_environment:integrationEnvironment.parse(input.environment),
      p_secret_ref:input.secretRef?.trim()||null,p_webhook_secret_ref:input.webhookSecretRef?.trim()||null,p_capabilities:input.capabilities??["issue","cancel"],p_config:{},p_actor_user_id:context.userId,
    });
    if(error) throw error; return data;
  }

  static async configureProfile(input:{ integrationId:string;issuerTaxId:string;stateRegistration?:string|null;municipalRegistration?:string|null;crtCode?:string|null;documentModel:string;environment:string;certificateRef?:string|null;emissionPolicy:string }){
    const context=await authorize(permission("fiscal.manage")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const integrationId=uuid.parse(input.integrationId);
    await scoped(admin.from("integrations").select("id").eq("id",integrationId).eq("organization_id",context.organizationId).eq("store_id",storeId).eq("kind","fiscal").eq("active",true).maybeSingle(),"Integração fiscal fora da unidade ativa");
    const { data,error }=await admin.rpc("fiscal_configure_profile_internal",{
      p_store_id:storeId,p_integration_id:integrationId,p_issuer_tax_id:input.issuerTaxId.trim(),p_state_registration:input.stateRegistration?.trim()||null,
      p_municipal_registration:input.municipalRegistration?.trim()||null,p_crt_code:input.crtCode?.trim()||null,p_default_document_model:model.parse(input.documentModel),
      p_environment:fiscalEnvironment.parse(input.environment),p_certificate_ref:input.certificateRef?.trim()||null,p_emission_policy:emissionPolicy.parse(input.emissionPolicy),p_actor_user_id:context.userId,
    });
    if(error) throw error; return data;
  }

  static async createProductProfile(input:{ productId:string;effectiveAt?:string|null;ncm?:string|null;cest?:string|null;cfop?:string|null;cstCsosn?:string|null;cclassTrib?:string|null }){
    const context=await authorize(permission("fiscal.manage")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const productId=uuid.parse(input.productId);
    await scoped(admin.from("products").select("id").eq("id",productId).eq("organization_id",context.organizationId).eq("store_id",storeId).is("deleted_at",null).maybeSingle(),"Produto fora da unidade ativa");
    const effectiveAt=input.effectiveAt?new Date(input.effectiveAt).toISOString():new Date().toISOString();
    const { data,error }=await admin.rpc("fiscal_create_product_profile_internal",{ p_product_id:productId,p_effective_at:effectiveAt,p_ncm:input.ncm?.trim()||null,p_cest:input.cest?.trim()||null,p_default_cfop:input.cfop?.trim()||null,p_cst_csosn:input.cstCsosn?.trim()||null,p_cclass_trib:input.cclassTrib?.trim()||null,p_tax_data:{},p_actor_user_id:context.userId });
    if(error) throw error; return data;
  }

  static async createDraft(input:{ orderId:string;documentModel:string;idempotencyKey:string }){
    const context=await authorize(permission("fiscal.issue")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const orderId=uuid.parse(input.orderId);
    await scoped(admin.from("orders").select("id").eq("id",orderId).eq("organization_id",context.organizationId).eq("store_id",storeId).in("order_status",["confirmed","completed"]).maybeSingle(),"Pedido não elegível nesta unidade");
    const { data,error }=await admin.rpc("fiscal_create_document_internal",{ p_order_id:orderId,p_model:model.parse(input.documentModel),p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId }); if(error) throw error; return data;
  }

  static async queue(input:{ fiscalDocumentId:string;idempotencyKey:string }){
    const context=await authorize(permission("fiscal.issue")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const fiscalDocumentId=uuid.parse(input.fiscalDocumentId);
    await scoped(admin.from("fiscal_documents").select("id").eq("id",fiscalDocumentId).eq("organization_id",context.organizationId).eq("store_id",storeId).in("status",["draft","rejected"]).maybeSingle(),"Documento fiscal não pode ser enviado nesta unidade");
    const { data,error }=await admin.rpc("fiscal_queue_document_internal",{ p_fiscal_document_id:fiscalDocumentId,p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId }); if(error) throw error; return data;
  }

  static async requestCancel(input:{ fiscalDocumentId:string;reason:string;idempotencyKey:string }){
    const context=await authorize(permission("fiscal.cancel")); const storeId=requireStore(context.storeId); const admin=createAdminClient(); const fiscalDocumentId=uuid.parse(input.fiscalDocumentId);
    await scoped(admin.from("fiscal_documents").select("id").eq("id",fiscalDocumentId).eq("organization_id",context.organizationId).eq("store_id",storeId).eq("status","authorized").maybeSingle(),"Documento autorizado não encontrado nesta unidade");
    const { data,error }=await admin.rpc("fiscal_request_cancel_internal",{ p_fiscal_document_id:fiscalDocumentId,p_reason:input.reason.trim(),p_idempotency_key:input.idempotencyKey,p_actor_user_id:context.userId }); if(error) throw error; return data;
  }
}
