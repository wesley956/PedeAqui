"use server";

import { revalidatePath } from "next/cache";
import { FiscalService } from "@/server/fiscal/fiscal-service";

export type FiscalActionState={ ok:boolean;message:string|null;error:string|null };
function text(formData:FormData,key:string){ const value=formData.get(key); return typeof value==="string"?value.trim():""; }
function optional(formData:FormData,key:string){ return text(formData,key)||null; }
function refresh(){ revalidatePath("/fiscal"); revalidatePath("/pedidos"); }
function friendly(error:unknown){ const raw=error instanceof Error?error.message:"Não foi possível concluir a operação fiscal."; const lower=raw.toLocaleLowerCase("pt-BR"); const rules:Array<[string,string]>=[
  ["active fiscal profile is required","Configure o perfil fiscal da unidade antes de emitir."],
  ["active fiscal integration is required","Configure uma integração fiscal ativa antes de emitir."],
  ["all fiscal items require a fiscal profile","Há produto sem classificação fiscal. Complete a ficha antes de enviar."],
  ["order is not eligible","O pedido ainda não está elegível para emissão."],
  ["only authorized fiscal document","Somente documento autorizado pode solicitar cancelamento."],
  ["invalid fiscal transition","O documento mudou de estado. Atualize a tela e tente novamente."],
]; for(const [needle,message] of rules) if(lower.includes(needle)) return message; return raw; }

export async function configureFiscalIntegrationAction(_previous:FiscalActionState,formData:FormData):Promise<FiscalActionState>{ try{ await FiscalService.configureIntegration({ providerKey:text(formData,"providerKey"),name:text(formData,"name"),environment:text(formData,"environment"),secretRef:optional(formData,"secretRef"),webhookSecretRef:optional(formData,"webhookSecretRef"),capabilities:["issue","cancel"] }); refresh(); return { ok:true,message:"Integração fiscal configurada.",error:null }; }catch(error){ return { ok:false,message:null,error:friendly(error) }; } }
export async function configureFiscalProfileAction(_previous:FiscalActionState,formData:FormData):Promise<FiscalActionState>{ try{ await FiscalService.configureProfile({ integrationId:text(formData,"integrationId"),issuerTaxId:text(formData,"issuerTaxId"),stateRegistration:optional(formData,"stateRegistration"),municipalRegistration:optional(formData,"municipalRegistration"),crtCode:optional(formData,"crtCode"),documentModel:text(formData,"documentModel"),environment:text(formData,"environment"),certificateRef:optional(formData,"certificateRef"),emissionPolicy:text(formData,"emissionPolicy") }); refresh(); return { ok:true,message:"Perfil fiscal salvo.",error:null }; }catch(error){ return { ok:false,message:null,error:friendly(error) }; } }
export async function createProductFiscalProfileAction(_previous:FiscalActionState,formData:FormData):Promise<FiscalActionState>{ try{ await FiscalService.createProductProfile({ productId:text(formData,"productId"),effectiveAt:optional(formData,"effectiveAt"),ncm:optional(formData,"ncm"),cest:optional(formData,"cest"),cfop:optional(formData,"cfop"),cstCsosn:optional(formData,"cstCsosn"),cclassTrib:optional(formData,"cclassTrib") }); refresh(); return { ok:true,message:"Nova versão fiscal do produto criada.",error:null }; }catch(error){ return { ok:false,message:null,error:friendly(error) }; } }
export async function createFiscalDraftAction(_previous:FiscalActionState,formData:FormData):Promise<FiscalActionState>{ try{ await FiscalService.createDraft({ orderId:text(formData,"orderId"),documentModel:text(formData,"documentModel"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Rascunho fiscal criado com snapshot do pedido.",error:null }; }catch(error){ return { ok:false,message:null,error:friendly(error) }; } }
export async function queueFiscalDocumentAction(_previous:FiscalActionState,formData:FormData):Promise<FiscalActionState>{ try{ await FiscalService.queue({ fiscalDocumentId:text(formData,"fiscalDocumentId"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Documento colocado na fila fiscal.",error:null }; }catch(error){ return { ok:false,message:null,error:friendly(error) }; } }
export async function requestFiscalCancelAction(_previous:FiscalActionState,formData:FormData):Promise<FiscalActionState>{ try{ await FiscalService.requestCancel({ fiscalDocumentId:text(formData,"fiscalDocumentId"),reason:text(formData,"reason"),idempotencyKey:text(formData,"idempotencyKey") }); refresh(); return { ok:true,message:"Cancelamento enviado para a fila fiscal.",error:null }; }catch(error){ return { ok:false,message:null,error:friendly(error) }; } }
