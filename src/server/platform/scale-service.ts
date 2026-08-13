import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize,AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { EntitlementService } from "@/server/platform/entitlement-service";

async function canManage(context:Awaited<ReturnType<typeof authorize>>){ try{ await authorize(PERMISSIONS.SCALE_MANAGE,context); return true; }catch(error){ if(error instanceof AuthorizationError) return false; throw error; } }

async function entitlement(admin:ReturnType<typeof createAdminClient>,organizationId:string,key:string){
  const { data,error }=await admin.rpc("organization_entitlement_internal",{ p_organization_id:organizationId,p_feature_key:key,p_at:new Date().toISOString() });
  if(error) throw error; return data as { enabled:boolean;limit_value:number|null;used:number;remaining:number|null;plan_key:string|null;subscription_status:string|null };
}

export class ScaleService{
  static async load(){
    const context=await authorize(PERMISSIONS.SCALE_VIEW); const admin=createAdminClient(); const organizationId=context.organizationId;
    const keys=["branding.white_label","domains.custom","scale.multiunit","scale.central_purchasing","scale.bi","integrations.marketplace"] as const;
    const [subscriptionResult,brandingResult,domainsResult,groupsResult,groupStoresResult,storesResult,canEdit,entitlements]=await Promise.all([
      admin.from("organization_subscriptions").select("id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_ends_at,grace_ends_at,cancel_at_period_end,billing_provider_key,provider_customer_id,provider_subscription_id,updated_at").eq("organization_id",organizationId).order("created_at",{ ascending:false }).limit(1).maybeSingle(),
      admin.from("organization_branding").select("*").eq("organization_id",organizationId).maybeSingle(),
      admin.from("organization_domains").select("id,store_id,hostname,status,verification_method,verification_token,verified_at,last_checked_at,last_error,updated_at").eq("organization_id",organizationId).order("created_at",{ ascending:false }),
      admin.from("franchise_groups").select("id,key,name,active,updated_at").eq("organization_id",organizationId).eq("active",true).order("name"),
      admin.from("franchise_group_stores").select("group_id,store_id").eq("organization_id",organizationId),
      admin.from("stores").select("id,name,status,is_primary").eq("organization_id",organizationId).order("name"),
      canManage(context),
      Promise.all(keys.map(async(key)=>[key,await entitlement(admin,organizationId,key)] as const)),
    ]);
    for(const result of [subscriptionResult,brandingResult,domainsResult,groupsResult,groupStoresResult,storesResult]) if(result.error) throw result.error;
    const ent=Object.fromEntries(entitlements) as Record<(typeof keys)[number],Awaited<ReturnType<typeof entitlement>>>;
    let plan:null|{ id:string;key:string;name:string }=null;
    if(subscriptionResult.data?.plan_id){ const { data,error }=await admin.from("plans").select("id,key,name").eq("id",subscriptionResult.data.plan_id).single(); if(error) throw error; plan=data; }
    const today=new Date(); const from=new Date(today.getTime()-29*86400000).toISOString().slice(0,10); const to=today.toISOString().slice(0,10);
    const [centralResult,biResult,marketResult]=await Promise.all([
      ent["scale.central_purchasing"].enabled?admin.rpc("central_purchase_needs_internal",{ p_organization_id:organizationId,p_group_id:null }):Promise.resolve({ data:[],error:null }),
      ent["scale.bi"].enabled?admin.rpc("multiunit_bi_internal",{ p_organization_id:organizationId,p_group_id:null,p_from:from,p_to:to }):Promise.resolve({ data:null,error:null }),
      ent["integrations.marketplace"].enabled?admin.rpc("integration_marketplace_internal",{ p_organization_id:organizationId,p_store_id:context.storeId }):Promise.resolve({ data:[],error:null }),
    ]);
    if(centralResult.error) throw centralResult.error; if(biResult.error) throw biResult.error; if(marketResult.error) throw marketResult.error;
    return { context,canEdit,subscription:subscriptionResult.data??null,plan,branding:brandingResult.data??null,domains:domainsResult.data??[],groups:groupsResult.data??[],groupStores:groupStoresResult.data??[],stores:storesResult.data??[],entitlements:ent,centralPurchasing:centralResult.data??[],bi:biResult.data??null,marketplace:marketResult.data??[],period:{ from,to } };
  }

  static async configureBranding(input:{ whiteLabelEnabled:boolean;productName?:string|null;logoAssetRef?:string|null;faviconAssetRef?:string|null;primaryColor?:string|null;secondaryColor?:string|null;supportUrl?:string|null;hidePedeAquiBranding:boolean }){
    const context=await authorize(PERMISSIONS.BRANDING_MANAGE);
    if(input.whiteLabelEnabled||input.hidePedeAquiBranding) await EntitlementService.require(PERMISSIONS.BRANDING_MANAGE,"branding.white_label",context);
    const admin=createAdminClient(); const { data,error }=await admin.rpc("configure_branding_entitled_internal",{ p_organization_id:context.organizationId,p_white_label_enabled:input.whiteLabelEnabled,p_product_name:input.productName??null,p_logo_asset_ref:input.logoAssetRef??null,p_favicon_asset_ref:input.faviconAssetRef??null,p_primary_color:input.primaryColor??null,p_secondary_color:input.secondaryColor??null,p_support_url:input.supportUrl??null,p_hide_pedeaqui_branding:input.hidePedeAquiBranding,p_actor_user_id:context.userId });
    if(error) throw error; return data;
  }

  static async configureDomain(input:{ hostname:string;storeId?:string|null }){
    const { context }=await EntitlementService.require(PERMISSIONS.BRANDING_MANAGE,"domains.custom"); const admin=createAdminClient();
    const { data,error }=await admin.rpc("configure_domain_entitled_internal",{ p_organization_id:context.organizationId,p_store_id:input.storeId??null,p_hostname:input.hostname.trim().toLowerCase(),p_actor_user_id:context.userId }); if(error) throw error; return data;
  }

  static async createGroup(input:{ key:string;name:string }){
    const { context }=await EntitlementService.require(PERMISSIONS.SCALE_MANAGE,"scale.multiunit"); const admin=createAdminClient();
    const { data,error }=await admin.rpc("create_franchise_group_internal",{ p_organization_id:context.organizationId,p_key:input.key,p_name:input.name,p_actor_user_id:context.userId }); if(error) throw error; return data;
  }

  static async assignStore(input:{ groupId:string;storeId:string }){
    const { context }=await EntitlementService.require(PERMISSIONS.SCALE_MANAGE,"scale.multiunit"); const admin=createAdminClient();
    const { data,error }=await admin.rpc("assign_franchise_group_store_internal",{ p_organization_id:context.organizationId,p_group_id:input.groupId,p_store_id:input.storeId,p_actor_user_id:context.userId }); if(error) throw error; return data;
  }

  static async installIntegration(input:{ adapterKey:string;environment:"sandbox"|"homologation"|"production";secretRef?:string|null;webhookSecretRef?:string|null }){
    const { context }=await EntitlementService.require(PERMISSIONS.INTEGRATIONS_MANAGE,"integrations.marketplace"); const admin=createAdminClient();
    const { data,error }=await admin.rpc("install_catalog_integration_internal",{ p_organization_id:context.organizationId,p_store_id:context.storeId,p_adapter_key:input.adapterKey,p_environment:input.environment,p_secret_ref:input.secretRef??null,p_webhook_secret_ref:input.webhookSecretRef??null,p_config:{},p_actor_user_id:context.userId }); if(error) throw error; return data;
  }
}
