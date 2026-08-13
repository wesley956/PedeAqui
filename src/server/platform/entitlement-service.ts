import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import type { AccessContext } from "@/server/access/context";
import type { PermissionKey } from "@/server/access/permissions";

export type EntitlementSnapshot={
  enabled:boolean;
  feature_key:string;
  limit_value:number|null;
  used:number;
  remaining:number|null;
  plan_key:string|null;
  subscription_status:string|null;
  period_start?:string|null;
  period_end?:string|null;
};

export class EntitlementError extends Error {
  constructor(public readonly featureKey:string,message=`Feature not entitled: ${featureKey}`){ super(message); this.name="EntitlementError"; }
}

async function load(organizationId:string,featureKey:string):Promise<EntitlementSnapshot>{
  const admin=createAdminClient();
  const { data,error }=await admin.rpc("organization_entitlement_internal",{ p_organization_id:organizationId,p_feature_key:featureKey,p_at:new Date().toISOString() });
  if(error) throw error;
  return data as EntitlementSnapshot;
}

export class EntitlementService {
  static async inspect(featureKey:string,existingContext?:AccessContext){
    const context=await authorize("subscription.view" as PermissionKey,existingContext);
    const entitlement=await load(context.organizationId,featureKey.trim());
    return { context,entitlement };
  }

  static async require(permission:PermissionKey,featureKey:string,existingContext?:AccessContext){
    const context=await authorize(permission,existingContext);
    const entitlement=await load(context.organizationId,featureKey.trim());
    if(!entitlement.enabled) throw new EntitlementError(featureKey);
    if(entitlement.limit_value!==null&&entitlement.remaining!==null&&entitlement.remaining<=0) throw new EntitlementError(featureKey,`Feature limit exhausted: ${featureKey}`);
    return { context,entitlement };
  }

  static async consume(input:{ permission:PermissionKey;featureKey:string;quantity?:number;idempotencyKey:string;sourceType?:string|null;sourceId?:string|null;metadata?:Record<string,unknown>;existingContext?:AccessContext }){
    const { context }=await this.require(input.permission,input.featureKey,input.existingContext);
    const admin=createAdminClient();
    const { data,error }=await admin.rpc("feature_usage_consume_internal",{
      p_organization_id:context.organizationId,p_feature_key:input.featureKey.trim(),p_quantity:input.quantity??1,p_idempotency_key:input.idempotencyKey,p_source_type:input.sourceType??null,p_source_id:input.sourceId??null,p_metadata:input.metadata??{},
    });
    if(error) throw error;
    return { context,usage:data };
  }
}
