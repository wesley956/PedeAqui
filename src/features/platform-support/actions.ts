"use server";

import { revalidatePath } from "next/cache";
import { PlatformModuleSupportService } from "@/server/platform/platform-module-support-service";
import { PlatformSupportActionService, type PlatformSupportCommon } from "@/server/platform/platform-support-action-service";

const text=(f:FormData,k:string)=>{const v=f.get(k);return typeof v==="string"?v.trim():""};
const checked=(f:FormData,k:string)=>f.get(k)==="on";
const num=(f:FormData,k:string)=>{const raw=text(f,k),v=Number(raw);if(!raw||!Number.isFinite(v))throw new Error("Valor inválido.");return v};
const common=(f:FormData):PlatformSupportCommon=>({organizationId:text(f,"organizationId"),storeId:text(f,"storeId"),reason:text(f,"reason"),protocol:text(f,"protocol"),idempotencyKey:text(f,"idempotencyKey")});
const refresh=(f:FormData)=>{const org=text(f,"organizationId"),store=text(f,"storeId");revalidatePath("/platform");revalidatePath(`/platform/empresas/${org}/unidades/${store}`)};

export async function supportStoreStatusAction(f:FormData){await PlatformSupportActionService.setStoreStatus({...common(f),status:text(f,"status") as "active"|"inactive"|"temporarily_closed"});refresh(f)}
export async function supportMenuPublishedAction(f:FormData){await PlatformSupportActionService.setMenuPublished({...common(f),active:text(f,"active")==="true"});refresh(f)}
export async function supportAcceptingOrdersAction(f:FormData){await PlatformSupportActionService.setAcceptingOrders({...common(f),accepting:text(f,"accepting")==="true",pauseReason:text(f,"pauseReason")||null});refresh(f)}
export async function supportFulfillmentAction(f:FormData){await PlatformSupportActionService.setFulfillment({...common(f),allowDelivery:checked(f,"allowDelivery"),allowPickup:checked(f,"allowPickup")});refresh(f)}
export async function supportPaymentAction(f:FormData){await PlatformSupportActionService.setPaymentMethod({...common(f),method:text(f,"method") as "cash"|"pix"|"credit_card"|"debit_card",enabled:text(f,"enabled")==="true"});refresh(f)}
export async function supportHourAction(f:FormData){await PlatformSupportActionService.addStoreHour({...common(f),weekday:num(f,"weekday"),opensAt:text(f,"opensAt"),closesAt:text(f,"closesAt"),closesNextDay:checked(f,"closesNextDay")});refresh(f)}
export async function supportDeliveryAction(f:FormData){await PlatformSupportActionService.configureDelivery({...common(f),enabled:checked(f,"enabled"),feeMode:text(f,"feeMode") as "default"|"neighborhood",defaultFeeCents:Math.round(num(f,"defaultFeeReais")*100),estimatedMinMinutes:num(f,"estimatedMinMinutes"),estimatedMaxMinutes:num(f,"estimatedMaxMinutes"),requireNeighborhoodMatch:checked(f,"requireNeighborhoodMatch")});refresh(f)}
export async function supportModuleAction(f:FormData){const base=common(f);await PlatformModuleSupportService.apply({...base,moduleKey:text(f,"moduleKey"),enabled:text(f,"enabled")==="true"});refresh(f)}
