"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

function text(formData:FormData,key:string){ const value=formData.get(key); return typeof value==="string"?value.trim():""; }
function optional(formData:FormData,key:string){ return text(formData,key)||null; }
function checked(formData:FormData,key:string){ return formData.get(key)==="on"; }
function numberValue(formData:FormData,key:string,fallback=0){ const value=Number(text(formData,key)); return Number.isFinite(value)?value:fallback; }
function refresh(){ revalidatePath("/platform"); revalidatePath("/escala"); }

export async function platformSubscriptionAction(formData:FormData){
  const status=text(formData,"status") as "trialing"|"active"|"past_due"|"cancelled"|"expired";
  const interval=text(formData,"billingInterval") as "month"|"year"|"manual";
  const reason=text(formData,"reason")||"Alteração manual pelo Painel do Proprietário";
  await PlatformAdminService.applySubscription({ organizationId:text(formData,"organizationId"),planKey:text(formData,"planKey"),status,billingInterval:interval,periodEnd:optional(formData,"periodEnd"),trialEndsAt:optional(formData,"trialEndsAt"),graceEndsAt:optional(formData,"graceEndsAt"),cancelAtPeriodEnd:checked(formData,"cancelAtPeriodEnd"),reason,protocol:optional(formData,"protocol"),idempotencyKey:text(formData,"idempotencyKey")||`platform:${randomUUID()}` }); refresh();
}

export async function platformPlanAction(formData:FormData){ await PlatformAdminService.upsertPlan({ key:text(formData,"key"),name:text(formData,"name"),description:optional(formData,"description"),active:checked(formData,"active"),position:numberValue(formData,"position") }); refresh(); }
export async function platformPlanFeatureAction(formData:FormData){ const raw=optional(formData,"limitValue"); await PlatformAdminService.setPlanFeature({ planId:text(formData,"planId"),featureId:text(formData,"featureId"),enabled:checked(formData,"enabled"),limitValue:raw===null?null:Number(raw) }); refresh(); }
export async function platformIntegrationCatalogAction(formData:FormData){ await PlatformAdminService.upsertIntegrationCatalog({ adapterKey:text(formData,"adapterKey"),kind:text(formData,"kind") as "billing"|"payment"|"whatsapp"|"marketplace"|"fiscal"|"delivery"|"generic",displayName:text(formData,"displayName"),description:optional(formData,"description"),active:checked(formData,"active"),position:numberValue(formData,"position") }); refresh(); }
