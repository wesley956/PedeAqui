import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export type DiagnosticTone = "good" | "warn" | "danger";
export type OrderDiagnosticFinding = { key:string; title:string; detail:string; tone:DiagnosticTone };
export type OrderTimelineEntry = { key:string; domain:string; label:string; detail:string; occurredAt:string };

const minute = 60_000;
const ageMinutes = (value:string)=>Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/minute));

export class PlatformOrderDiagnosticService {
  static async listRecent(limit=100){
    await PlatformAdminService.access();
    const admin=createAdminClient();
    const safeLimit=Math.min(Math.max(limit,1),200);
    const { data:orders,error }=await admin.from("orders").select("id,organization_id,store_id,display_number,channel,fulfillment_type,order_status,payment_status,production_status,fulfillment_status,total_cents,payment_method_snapshot,created_at,updated_at").order("created_at",{ascending:false}).limit(safeLimit);
    if(error)throw error;
    const orgIds=[...new Set((orders??[]).map(row=>row.organization_id))];
    const storeIds=[...new Set((orders??[]).map(row=>row.store_id))];
    const [orgs,stores]=await Promise.all([
      orgIds.length?admin.from("organizations").select("id,name").in("id",orgIds):Promise.resolve({data:[],error:null}),
      storeIds.length?admin.from("stores").select("id,name").in("id",storeIds):Promise.resolve({data:[],error:null}),
    ]);
    if(orgs.error)throw orgs.error;if(stores.error)throw stores.error;
    const orgMap=new Map((orgs.data??[]).map(row=>[row.id,row.name]));
    const storeMap=new Map((stores.data??[]).map(row=>[row.id,row.name]));
    return (orders??[]).map(order=>({...order,organizationName:orgMap.get(order.organization_id)??"Empresa",storeName:storeMap.get(order.store_id)??"Unidade"}));
  }

  static async load(orderId:string){
    await PlatformAdminService.access();
    const admin=createAdminClient();
    const { data:order,error:orderError }=await admin.from("orders").select("id,organization_id,store_id,display_number,channel,fulfillment_type,order_status,payment_status,production_status,fulfillment_status,total_cents,payment_method_snapshot,confirmed_at,completed_at,canceled_at,created_at,updated_at").eq("id",orderId).maybeSingle();
    if(orderError)throw orderError;if(!order)return null;
    const [org,store,stateHistory,payments,delivery,deliveryHistory,printJobs,events]=await Promise.all([
      admin.from("organizations").select("id,name").eq("id",order.organization_id).maybeSingle(),
      admin.from("stores").select("id,name").eq("id",order.store_id).eq("organization_id",order.organization_id).maybeSingle(),
      admin.from("order_state_history").select("id,state_domain,from_state,to_state,reason,source,created_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("payments").select("id,method,status,amount_cents,source,paid_at,failed_at,canceled_at,refunded_at,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("deliveries").select("id,driver_id,promised_by_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,canceled_at,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).maybeSingle(),
      admin.from("delivery_history").select("id,event_type,reason,created_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("print_jobs").select("id,document_type,status,attempts,max_attempts,copies,printed_at,failed_at,last_error,is_reprint,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("domain_events").select("id,event_type,entity_type,status,attempts,error_message,occurred_at,processed_at,created_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("entity_id",order.id).order("occurred_at"),
    ]);
    for(const result of [org,store,stateHistory,payments,delivery,deliveryHistory,printJobs,events])if(result.error)throw result.error;

    const findings:OrderDiagnosticFinding[]=[];
    const age=ageMinutes(order.updated_at);
    if(order.order_status==="pending_confirmation"&&age>10)findings.push({key:"acceptance",title:"Pedido aguardando confirmação",detail:`Está sem avanço há cerca de ${age} minuto(s). Verifique a operação da unidade.`,tone:"warn"});
    if(order.payment_status==="failed"||payments.data?.some(p=>p.status==="failed"))findings.push({key:"payment_failed",title:"Falha no pagamento",detail:"Há registro financeiro em falha. Não marque como pago manualmente; use o fluxo financeiro oficial.",tone:"danger"});
    if(order.payment_method_snapshot==="pix"&&order.payment_status==="pending"&&age>20)findings.push({key:"pix_pending",title:"PIX aguardando confirmação",detail:"O pagamento permanece pendente além da janela de atenção. Quando o PIX online estiver habilitado, use reconciliação oficial.",tone:"warn"});
    if(["queued","preparing"].includes(order.production_status)&&age>45)findings.push({key:"production",title:"Produção sem avanço recente",detail:`O estado de produção não muda há cerca de ${age} minuto(s).`,tone:"warn"});
    if(order.fulfillment_status==="out_for_delivery"&&delivery.data?.out_for_delivery_at&&ageMinutes(delivery.data.out_for_delivery_at)>120)findings.push({key:"delivery",title:"Entrega em rota há muito tempo",detail:"A entrega ultrapassou 120 minutos em rota. Confirme a situação com a unidade/entregador antes de qualquer ação.",tone:"warn"});
    const failedPrints=(printJobs.data??[]).filter(job=>job.status==="failed");
    if(failedPrints.length)findings.push({key:"printing",title:"Falha de impressão",detail:`${failedPrints.length} job(s) de impressão falharam. O pedido continua válido no sistema.`,tone:"warn"});
    const failedEvents=(events.data??[]).filter(event=>event.status==="failed");
    if(failedEvents.length)findings.push({key:"event",title:"Evento interno com falha",detail:`${failedEvents.length} evento(s) estão marcados como falha e precisam de investigação.`,tone:"warn"});
    if(order.order_status==="completed"&&order.fulfillment_type==="delivery"&&order.fulfillment_status!=="delivered")findings.push({key:"inconsistent_delivery",title:"Conclusão incompatível com entrega",detail:"O pedido está concluído, mas a entrega não está marcada como entregue. Investigue antes de reparar qualquer dado.",tone:"danger"});
    if(findings.length===0)findings.push({key:"healthy",title:"Nenhum bloqueio óbvio detectado",detail:"Os estados consultados não mostram anomalia operacional conhecida neste momento.",tone:"good"});

    const timeline:OrderTimelineEntry[]=[
      {key:`order:${order.id}`,domain:"Pedido",label:"Pedido criado",detail:`Canal ${order.channel} · ${order.fulfillment_type}`,occurredAt:order.created_at},
      ...(stateHistory.data??[]).map(row=>({key:`state:${row.id}`,domain:row.state_domain,label:`${row.from_state??"início"} → ${row.to_state}`,detail:row.reason||`Origem: ${row.source}`,occurredAt:row.created_at})),
      ...(payments.data??[]).map(row=>({key:`payment:${row.id}`,domain:"Pagamento",label:`${row.method} · ${row.status}`,detail:`${(Number(row.amount_cents)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} · origem ${row.source}`,occurredAt:row.paid_at||row.failed_at||row.canceled_at||row.refunded_at||row.updated_at||row.created_at})),
      ...(deliveryHistory.data??[]).map(row=>({key:`delivery:${row.id}`,domain:"Entrega",label:row.event_type,detail:row.reason||"Movimentação logística registrada",occurredAt:row.created_at})),
      ...(printJobs.data??[]).map(row=>({key:`print:${row.id}`,domain:"Impressão",label:`${row.document_type} · ${row.status}`,detail:row.last_error?String(row.last_error).slice(0,180):`Tentativas: ${row.attempts}/${row.max_attempts}`,occurredAt:row.printed_at||row.failed_at||row.updated_at||row.created_at})),
      ...(events.data??[]).map(row=>({key:`event:${row.id}`,domain:"Evento",label:`${row.event_type} · ${row.status}`,detail:row.error_message?String(row.error_message).slice(0,180):`Tentativas: ${row.attempts}`,occurredAt:row.occurred_at})),
    ].sort((a,b)=>new Date(a.occurredAt).getTime()-new Date(b.occurredAt).getTime());

    return { order:{...order,organizationName:org.data?.name??"Empresa",storeName:store.data?.name??"Unidade"}, findings, timeline, payments:payments.data??[], delivery:delivery.data??null, printJobs:printJobs.data??[], failedPrintJobs:failedPrints };
  }
}
