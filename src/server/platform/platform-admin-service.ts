import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/session";

export class PlatformAuthorizationError extends Error{ constructor(){ super("Platform admin required"); this.name="PlatformAuthorizationError"; } }

async function requirePlatformAdmin(requireSuperAdmin=false){
  const user=await requireAuthenticatedUser(); const admin=createAdminClient();
  const { data,error }=await admin.rpc("platform_admin_check_internal",{ p_user_id:user.id }); if(error) throw error;
  const role=Array.isArray(data)?data[0]?.role:null;
  if(!role||(requireSuperAdmin&&role!=="super_admin")) throw new PlatformAuthorizationError();
  return { user,admin,role:role as "super_admin"|"support" };
}

export class PlatformAdminService{
  static async load(){
    const { user,admin,role }=await requirePlatformAdmin(false);
    const [plans,features,planFeatures,organizations,subscriptions,catalog,webhooks]=await Promise.all([
      admin.from("plans").select("id,key,name,description,active,position,updated_at").order("position"),
      admin.from("features").select("id,key,name,value_type,active").order("key"),
      admin.from("plan_features").select("plan_id,feature_id,enabled,limit_value,config"),
      admin.from("organizations").select("id,name,status,created_at").order("created_at",{ ascending:false }).limit(200),
      admin.from("organization_subscriptions").select("id,organization_id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_ends_at,grace_ends_at,cancel_at_period_end,billing_provider_key,updated_at").order("updated_at",{ ascending:false }).limit(300),
      admin.from("integration_catalog").select("id,adapter_key,kind,display_name,description,capabilities,active,position").order("position"),
      admin.from("billing_webhook_receipts").select("id,provider_key,external_event_id,status,error_message,created_at,processed_at").order("created_at",{ ascending:false }).limit(100),
    ]);
    for(const result of [plans,features,planFeatures,organizations,subscriptions,catalog,webhooks]) if(result.error) throw result.error;
    return { user,role,plans:plans.data??[],features:features.data??[],planFeatures:planFeatures.data??[],organizations:organizations.data??[],subscriptions:subscriptions.data??[],catalog:catalog.data??[],webhooks:webhooks.data??[] };
  }

  static async applySubscription(input:{ organizationId:string;planKey:string;status:"trialing"|"active"|"past_due"|"cancelled"|"expired";billingInterval:"month"|"year"|"manual";periodEnd?:string|null;trialEndsAt?:string|null;graceEndsAt?:string|null;cancelAtPeriodEnd:boolean;idempotencyKey:string }){
    const { admin }=await requirePlatformAdmin(true);
    const now=new Date().toISOString();
    const { data,error }=await admin.rpc("subscription_apply_internal",{ p_organization_id:input.organizationId,p_plan_key:input.planKey,p_to_status:input.status,p_idempotency_key:input.idempotencyKey,p_event_type:"platform.subscription_change",p_billing_interval:input.billingInterval,p_current_period_start:now,p_current_period_end:input.periodEnd??null,p_trial_ends_at:input.trialEndsAt??null,p_grace_ends_at:input.graceEndsAt??null,p_cancel_at_period_end:input.cancelAtPeriodEnd,p_billing_provider_key:null,p_provider_customer_id:null,p_provider_subscription_id:null,p_metadata:{ source:"platform_admin" } });
    if(error) throw error; return data;
  }

  static async upsertPlan(input:{ key:string;name:string;description?:string|null;active:boolean;position:number }){
    const { admin }=await requirePlatformAdmin(true);
    const { data,error }=await admin.from("plans").upsert({ key:input.key.trim().toLowerCase(),name:input.name.trim(),description:input.description?.trim()||null,active:input.active,position:input.position,updated_at:new Date().toISOString() },{ onConflict:"key" }).select("id,key,name").single(); if(error) throw error; return data;
  }

  static async setPlanFeature(input:{ planId:string;featureId:string;enabled:boolean;limitValue:number|null }){
    const { admin }=await requirePlatformAdmin(true);
    const { data,error }=await admin.from("plan_features").upsert({ plan_id:input.planId,feature_id:input.featureId,enabled:input.enabled,limit_value:input.limitValue,updated_at:new Date().toISOString() },{ onConflict:"plan_id,feature_id" }).select("plan_id,feature_id,enabled,limit_value").single(); if(error) throw error; return data;
  }

  static async upsertIntegrationCatalog(input:{ adapterKey:string;kind:"billing"|"payment"|"whatsapp"|"marketplace"|"fiscal"|"delivery"|"generic";displayName:string;description?:string|null;active:boolean;position:number }){
    const { admin }=await requirePlatformAdmin(true);
    const { data,error }=await admin.from("integration_catalog").upsert({ adapter_key:input.adapterKey.trim().toLowerCase(),kind:input.kind,display_name:input.displayName.trim(),description:input.description?.trim()||null,capabilities:[],config_schema:{},active:input.active,position:input.position,updated_at:new Date().toISOString() },{ onConflict:"adapter_key" }).select("id,adapter_key,display_name").single(); if(error) throw error; return data;
  }
}
