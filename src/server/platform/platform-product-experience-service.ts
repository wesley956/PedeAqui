import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

const PERIOD_DAYS = 14;
const PILOT_NAMES = ["dona maria", "dom burger"];

type EventRow = { event_name:string; outcome:string|null; duration_ms:number|null; order_id:string|null; occurred_at:string };
type OrderRow = { id:string; order_status:string; checkout_session_id:string|null; created_at:string; completed_at:string|null };
type CheckoutRow = { id:string;created_at:string;reviewed_at:string|null };
export type ProductExperiencePeriod = { from:string;to:string;orders:number;completed:number;completionRate:number|null;checkoutStarted:number;checkoutAbandoned:number;checkoutAbandonmentRate:number|null;measuredOrderActions:number;actionsPerCompletedOrder:number|null;averageActionDurationMs:number|null;realtimeFailures:number;realtimeRecoveries:number;printFailures:number;printRecoveries:number };
export type PilotProductExperience = { id:string;organizationId:string;name:string;slug:string;firstOrderAt:string|null;fifthOrderAt:string|null;totalOrders:number;current:ProductExperiencePeriod;previous:ProductExperiencePeriod;measurementStartedAt:string|null };

const mean=(values:number[])=>values.length?Math.round(values.reduce((total,value)=>total+value,0)/values.length):null;
function summarize(orders:OrderRow[],checkouts:CheckoutRow[],events:EventRow[],prints:Array<{status:string;is_reprint:boolean;attempts:number;created_at:string}>,from:Date,to:Date):ProductExperiencePeriod{
 const inPeriod=(value:string)=>{const time=new Date(value).getTime();return time>=from.getTime()&&time<to.getTime();};
 const periodOrders=orders.filter(order=>inPeriod(order.created_at));
 const completed=periodOrders.filter(order=>order.order_status==="completed");
 const periodEvents=events.filter(event=>inPeriod(event.occurred_at));
 const periodCheckouts=checkouts.filter(checkout=>inPeriod(checkout.created_at));
 const convertedCheckoutIds=new Set(orders.flatMap(order=>order.checkout_session_id?[order.checkout_session_id]:[]));
 const abandonedCheckouts=periodCheckouts.filter(checkout=>!convertedCheckoutIds.has(checkout.id)&&new Date(checkout.created_at).getTime()<Date.now()-30*60_000);
 const actions=periodEvents.filter(event=>event.event_name==="px.order.action");
 const periodPrints=prints.filter(job=>inPeriod(job.created_at));
 return {from:from.toISOString(),to:to.toISOString(),orders:periodOrders.length,completed:completed.length,
  completionRate:periodOrders.length?completed.length/periodOrders.length:null,checkoutStarted:periodCheckouts.length,checkoutAbandoned:abandonedCheckouts.length,checkoutAbandonmentRate:periodCheckouts.length?abandonedCheckouts.length/periodCheckouts.length:null,
  measuredOrderActions:actions.length,actionsPerCompletedOrder:completed.length?actions.length/completed.length:null,
  averageActionDurationMs:mean(actions.flatMap(event=>event.duration_ms==null?[]:[Number(event.duration_ms)])),
  realtimeFailures:periodEvents.filter(event=>event.event_name==="px.realtime.connection"&&event.outcome==="failure").length,
  realtimeRecoveries:periodEvents.filter(event=>event.event_name==="px.realtime.connection"&&event.outcome==="recovered").length,
  printFailures:periodPrints.filter(job=>job.status==="failed").length,
  printRecoveries:periodPrints.filter(job=>job.is_reprint&&job.status==="printed").length};
}

export class PlatformProductExperienceService{
 static async loadPilots():Promise<PilotProductExperience[]>{
  await PlatformAdminService.access();const admin=createAdminClient();
  const {data:stores,error:storeError}=await admin.from("stores").select("id,organization_id,name,slug").order("created_at");
  if(storeError)throw storeError;
  const pilots=(stores??[]).filter(store=>{const name=store.name.toLocaleLowerCase("pt-BR");const slug=store.slug.toLocaleLowerCase("pt-BR").replaceAll("-"," ");return PILOT_NAMES.some(pilot=>name.includes(pilot)||slug.includes(pilot));});
  const now=new Date();const currentFrom=new Date(now.getTime()-PERIOD_DAYS*86_400_000);const previousFrom=new Date(currentFrom.getTime()-PERIOD_DAYS*86_400_000);
  return Promise.all(pilots.map(async store=>{
   const [ordersResult,checkoutsResult,eventsResult,printsResult]=await Promise.all([
    admin.from("orders").select("id,order_status,checkout_session_id,created_at,completed_at").eq("organization_id",store.organization_id).eq("store_id",store.id).order("created_at").limit(5000),
    admin.from("checkout_sessions").select("id,created_at,reviewed_at").eq("organization_id",store.organization_id).eq("store_id",store.id).gte("created_at",previousFrom.toISOString()).limit(5000),
    admin.from("product_experience_events").select("event_name,outcome,duration_ms,order_id,occurred_at").eq("organization_id",store.organization_id).eq("store_id",store.id).gte("occurred_at",previousFrom.toISOString()).order("occurred_at").limit(10000),
    admin.from("print_jobs").select("status,is_reprint,attempts,created_at").eq("organization_id",store.organization_id).eq("store_id",store.id).gte("created_at",previousFrom.toISOString()).limit(5000),
   ]);
   for(const result of [ordersResult,checkoutsResult,eventsResult,printsResult])if(result.error)throw result.error;
   const orders=(ordersResult.data??[]) as OrderRow[];const checkouts=(checkoutsResult.data??[]) as CheckoutRow[];const events=(eventsResult.data??[]) as EventRow[];const prints=printsResult.data??[];
   return {id:store.id,organizationId:store.organization_id,name:store.name,slug:store.slug,firstOrderAt:orders[0]?.created_at??null,fifthOrderAt:orders[4]?.created_at??null,totalOrders:orders.length,current:summarize(orders,checkouts,events,prints,currentFrom,now),previous:summarize(orders,checkouts,events,prints,previousFrom,currentFrom),measurementStartedAt:events[0]?.occurred_at??null};
  }));
 }
}
