import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";

const uuid=z.string().uuid();
const permission=(value:string)=>value as PermissionKey;

export class SupplierTermService {
  static async update(input:{ supplierId:string;paymentTermDays:number }){
    const context=await authorize(permission("finance.manage"));
    if(!context.storeId) throw new Error("Uma unidade ativa é necessária");
    const supplierId=uuid.parse(input.supplierId);
    const paymentTermDays=z.number().int().min(0).max(3650).parse(input.paymentTermDays);
    const admin=createAdminClient();
    const scoped=await admin.from("supplier_stores").select("supplier_id").eq("organization_id",context.organizationId).eq("store_id",context.storeId).eq("supplier_id",supplierId).maybeSingle();
    if(scoped.error) throw scoped.error; if(!scoped.data) throw new Error("Fornecedor fora da unidade ativa");
    const { data,error }=await admin.rpc("financial_update_supplier_term_internal",{ p_store_id:context.storeId,p_supplier_id:supplierId,p_payment_term_days:paymentTermDays,p_actor_user_id:context.userId });
    if(error) throw error; return data;
  }
}
