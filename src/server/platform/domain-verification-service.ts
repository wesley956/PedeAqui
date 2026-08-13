import "server-only";

import { resolveTxt } from "node:dns/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export class DomainVerificationService{
  static async verify(domainId:string){
    const context=await authorize(PERMISSIONS.BRANDING_MANAGE); const admin=createAdminClient();
    const { data:domain,error }=await admin.from("organization_domains").select("id,hostname,verification_token,status").eq("id",domainId).eq("organization_id",context.organizationId).maybeSingle();
    if(error) throw error; if(!domain) throw new Error("Domínio fora da organização ativa");
    const recordName=`_pedeaqui.${domain.hostname}`;
    const expected=`pedeaqui-verification=${domain.verification_token}`;
    try{
      const records=await resolveTxt(recordName);
      const values=records.map(parts=>parts.join(""));
      if(!values.includes(expected)) throw new Error(`TXT ${recordName} não contém o token esperado`);
      const { data,error:markError }=await admin.rpc("mark_domain_verification_internal",{ p_domain_id:domain.id,p_status:"verified",p_provider_domain_id:null,p_error:null }); if(markError) throw markError; return data;
    }catch(error){
      const message=error instanceof Error?error.message:"Falha ao consultar DNS";
      const { error:markError }=await admin.rpc("mark_domain_verification_internal",{ p_domain_id:domain.id,p_status:"failed",p_provider_domain_id:null,p_error:message }); if(markError) throw markError;
      throw new Error(message);
    }
  }
}
