"use server";

import { revalidatePath } from "next/cache";
import { ScaleService } from "@/server/platform/scale-service";

function text(formData:FormData,key:string){ const value=formData.get(key); return typeof value==="string"?value.trim():""; }
function checked(formData:FormData,key:string){ return formData.get(key)==="on"; }
function optional(formData:FormData,key:string){ return text(formData,key)||null; }
function refresh(){ revalidatePath("/escala"); revalidatePath("/dashboard"); }

export async function configureBrandingAction(formData:FormData){
  await ScaleService.configureBranding({ whiteLabelEnabled:checked(formData,"whiteLabelEnabled"),productName:optional(formData,"productName"),logoAssetRef:optional(formData,"logoAssetRef"),faviconAssetRef:optional(formData,"faviconAssetRef"),primaryColor:optional(formData,"primaryColor"),secondaryColor:optional(formData,"secondaryColor"),supportUrl:optional(formData,"supportUrl"),hidePedeAquiBranding:checked(formData,"hidePedeAquiBranding") }); refresh();
}

export async function configureDomainAction(formData:FormData){ await ScaleService.configureDomain({ hostname:text(formData,"hostname"),storeId:optional(formData,"storeId") }); refresh(); }
export async function createScaleGroupAction(formData:FormData){ await ScaleService.createGroup({ key:text(formData,"key"),name:text(formData,"name") }); refresh(); }
export async function assignScaleStoreAction(formData:FormData){ await ScaleService.assignStore({ groupId:text(formData,"groupId"),storeId:text(formData,"storeId") }); refresh(); }
export async function installIntegrationAction(formData:FormData){ const environment=text(formData,"environment"); if(!["sandbox","homologation","production"].includes(environment)) throw new Error("Ambiente inválido"); await ScaleService.installIntegration({ adapterKey:text(formData,"adapterKey"),environment:environment as "sandbox"|"homologation"|"production",secretRef:optional(formData,"secretRef"),webhookSecretRef:optional(formData,"webhookSecretRef") }); refresh(); }
