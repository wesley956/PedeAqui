import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import {
  maskWhatsAppRecipient,
  notificationDeliveryLabel,
  orderNotificationFailureLabel,
} from "@/server/platform/order-whatsapp-diagnostic";

export type DiagnosticTone = "good" | "warn" | "danger";
export type OrderDiagnosticFinding = { key:string; title:string; detail:string; tone:DiagnosticTone };
export type OrderTimelineEntry = { key:string; domain:string; label:string; detail:string; occurredAt:string };
export type OrderWhatsAppChainEntry = {
  id:string;
  notificationType:string;
  domainEventId:string|null;
  messageId:string|null;
  providerMessageId:string|null;
  conversationId:string|null;
  contactId:string|null;
  recipientMasked:string|null;
  queueStatus:string;
  providerStatus:string|null;
  outcomeLabel:string;
  failureCategory:string|null;
  errorCode:string|null;
  errorDetail:string|null;
  attempts:number;
  nextAttemptAt:string|null;
  createdAt:string;
  updatedAt:string;
};

const minute = 60_000;
const ageMinutes = (value:string)=>Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/minute));
const safeSupportText=(value:string|null|undefined,fallback:string)=>{
  if(!value)return fallback;
  return value.replace(/Bearer\s+\S+/gi,"credencial protegida").replace(/[A-Za-z0-9_-]{32,}/g,"[dado protegido]").slice(0,180);
};
const safeOptionalSupportText=(value:string|null|undefined)=>value? safeSupportText(value,""):null;

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
    const { data:order,error:orderError }=await admin.from("orders").select("id,organization_id,store_id,source_cart_id,checkout_session_id,customer_id,display_number,channel,fulfillment_type,order_status,payment_status,production_status,fulfillment_status,total_cents,payment_method_snapshot,confirmed_at,completed_at,canceled_at,created_at,updated_at").eq("id",orderId).maybeSingle();
    if(orderError)throw orderError;if(!order)return null;
    const [org,store,stateHistory,payments,delivery,deliveryHistory,printJobs,events,checkout,notifications]=await Promise.all([
      admin.from("organizations").select("id,name").eq("id",order.organization_id).maybeSingle(),
      admin.from("stores").select("id,name").eq("id",order.store_id).eq("organization_id",order.organization_id).maybeSingle(),
      admin.from("order_state_history").select("id,state_domain,from_state,to_state,reason,source,created_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("payments").select("id,method,status,amount_cents,source,paid_at,failed_at,canceled_at,refunded_at,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("deliveries").select("id,driver_id,promised_by_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,canceled_at,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).maybeSingle(),
      admin.from("delivery_history").select("id,event_type,reason,created_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("print_jobs").select("id,document_type,status,attempts,max_attempts,copies,printed_at,failed_at,last_error,is_reprint,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
      admin.from("domain_events").select("id,event_type,entity_type,status,attempts,error_message,occurred_at,processed_at,created_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("entity_id",order.id).order("occurred_at"),
      admin.from("checkout_sessions").select("id,cart_id,customer_id,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("id",order.checkout_session_id).eq("cart_id",order.source_cart_id).maybeSingle(),
      admin.from("order_whatsapp_notifications").select("id,domain_event_id,notification_type,status,attempts,available_at,locked_until,message_id,last_error_code,last_error_message,sent_at,workflow_checkpoint,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).eq("order_id",order.id).order("created_at"),
    ]);
    for(const result of [org,store,stateHistory,payments,delivery,deliveryHistory,printJobs,events,checkout,notifications])if(result.error)throw result.error;

    const messageIds=(notifications.data??[]).flatMap(row=>row.message_id?[row.message_id]:[]);
    const {data:messages,error:messagesError}=messageIds.length
      ?await admin.from("messages").select("id,conversation_id,contact_id,external_message_id,delivery_status,error_code,error_message,provider_timestamp,created_at,updated_at").eq("organization_id",order.organization_id).eq("store_id",order.store_id).in("id",messageIds)
      :{data:[],error:null};
    if(messagesError)throw messagesError;
    const conversationIds=[...new Set((messages??[]).map(row=>row.conversation_id))];
    const contactIds=[...new Set((messages??[]).map(row=>row.contact_id))];
    const [{data:conversations,error:conversationsError},{data:contacts,error:contactsError}]=await Promise.all([
      conversationIds.length?admin.from("conversations").select("id,contact_id").eq("organization_id",order.organization_id).eq("store_id",order.store_id).in("id",conversationIds):Promise.resolve({data:[],error:null}),
      contactIds.length?admin.from("contacts").select("id,customer_id,phone_normalized,external_id").eq("organization_id",order.organization_id).eq("store_id",order.store_id).in("id",contactIds):Promise.resolve({data:[],error:null}),
    ]);
    if(conversationsError)throw conversationsError;if(contactsError)throw contactsError;
    const messageMap=new Map((messages??[]).map(row=>[row.id,row]));
    const conversationMap=new Map((conversations??[]).map(row=>[row.id,row]));
    const contactMap=new Map((contacts??[]).map(row=>[row.id,row]));
    const whatsappChain:OrderWhatsAppChainEntry[]=(notifications.data??[]).map(job=>{
      const message=job.message_id?messageMap.get(job.message_id):null;
      const conversation=message?conversationMap.get(message.conversation_id):null;
      const contact=message?contactMap.get(message.contact_id):null;
      const errorCode=message?.error_code??job.last_error_code??null;
      return {
        id:job.id,
        notificationType:job.notification_type,
        domainEventId:job.domain_event_id,
        messageId:job.message_id,
        providerMessageId:message?.external_message_id??null,
        conversationId:conversation?.id??message?.conversation_id??null,
        contactId:contact?.id??conversation?.contact_id??message?.contact_id??null,
        recipientMasked:maskWhatsAppRecipient(contact?.phone_normalized??contact?.external_id),
        queueStatus:job.status,
        providerStatus:message?.delivery_status??null,
        outcomeLabel:notificationDeliveryLabel({queueStatus:job.status,providerStatus:message?.delivery_status}),
        failureCategory:orderNotificationFailureLabel(errorCode),
        errorCode,
        errorDetail:safeOptionalSupportText(message?.error_message??job.last_error_message),
        attempts:Number(job.attempts),
        nextAttemptAt:job.status==="failed"?job.available_at:null,
        createdAt:job.created_at,
        updatedAt:message?.provider_timestamp??message?.updated_at??job.sent_at??job.updated_at,
      };
    });

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
    const failedNotifications=whatsappChain.filter(item=>item.queueStatus==="failed"||item.providerStatus==="failed");
    const blockedNotifications=whatsappChain.filter(item=>item.queueStatus==="skipped");
    const repeatedFailures=whatsappChain.filter(item=>item.attempts>=3&&(item.queueStatus==="failed"||item.providerStatus==="failed"));
    if(failedNotifications.length)findings.push({key:"whatsapp_notification_failed",title:"Falha na atualização por WhatsApp",detail:`${failedNotifications.length} atualização(ões) falharam. A cadeia abaixo identifica a fronteira e a próxima tentativa.`,tone:"danger"});
    if(blockedNotifications.length)findings.push({key:"whatsapp_notification_blocked",title:"Atualização do WhatsApp bloqueada com segurança",detail:`${blockedNotifications.length} atualização(ões) não foram enviadas por identidade, configuração, Meta ou regra do fluxo.`,tone:"warn"});
    if(repeatedFailures.length)findings.push({key:"whatsapp_repeated_failure",title:"Falha repetida exige atenção",detail:`${repeatedFailures.length} atualização(ões) já atingiram três ou mais tentativas. Verifique a categoria antes de qualquer reprocessamento.`,tone:"danger"});
    if((notifications.data??[]).some(item=>!item.domain_event_id))findings.push({key:"whatsapp_event_gap",title:"Notificação sem evento autoritativo",detail:"Existe job sem vínculo ao evento do pedido. O worker bloqueia o envio para evitar mensagem incorreta.",tone:"danger"});
    if(order.order_status==="completed"&&order.fulfillment_type==="delivery"&&order.fulfillment_status!=="delivered")findings.push({key:"inconsistent_delivery",title:"Conclusão incompatível com entrega",detail:"O pedido está concluído, mas a entrega não está marcada como entregue. Investigue antes de reparar qualquer dado.",tone:"danger"});
    if(findings.length===0)findings.push({key:"healthy",title:"Nenhum bloqueio óbvio detectado",detail:"Os estados consultados não mostram anomalia operacional conhecida neste momento.",tone:"good"});

    const timeline:OrderTimelineEntry[]=[
      {key:`order:${order.id}`,domain:"Pedido",label:"Pedido criado",detail:`Canal ${order.channel} · ${order.fulfillment_type}`,occurredAt:order.created_at},
      ...(stateHistory.data??[]).map(row=>({key:`state:${row.id}`,domain:row.state_domain,label:`${row.from_state??"início"} → ${row.to_state}`,detail:safeSupportText(row.reason,`Origem: ${row.source}`),occurredAt:row.created_at})),
      ...(payments.data??[]).map(row=>({key:`payment:${row.id}`,domain:"Pagamento",label:`${row.method} · ${row.status}`,detail:`${(Number(row.amount_cents)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} · origem ${row.source}`,occurredAt:row.paid_at||row.failed_at||row.canceled_at||row.refunded_at||row.updated_at||row.created_at})),
      ...(deliveryHistory.data??[]).map(row=>({key:`delivery:${row.id}`,domain:"Entrega",label:row.event_type,detail:safeSupportText(row.reason,"Movimentação logística registrada"),occurredAt:row.created_at})),
      ...(printJobs.data??[]).map(row=>({key:`print:${row.id}`,domain:"Impressão",label:`${row.document_type} · ${row.status}`,detail:safeSupportText(row.last_error,`Tentativas: ${row.attempts}/${row.max_attempts}`),occurredAt:row.printed_at||row.failed_at||row.updated_at||row.created_at})),
      ...(events.data??[]).map(row=>({key:`event:${row.id}`,domain:"Evento",label:`${row.event_type} · ${row.status}`,detail:safeSupportText(row.error_message,`Tentativas: ${row.attempts}`),occurredAt:row.occurred_at})),
      ...whatsappChain.map(row=>({key:`whatsapp:${row.id}`,domain:"WhatsApp",label:`${row.notificationType} · ${row.outcomeLabel}`,detail:row.failureCategory?`${row.failureCategory} · ${row.errorCode??"sem código"}`:`Tentativas: ${row.attempts}`,occurredAt:row.updatedAt})),
    ].sort((a,b)=>new Date(a.occurredAt).getTime()-new Date(b.occurredAt).getTime());

    return { order:{...order,organizationName:org.data?.name??"Empresa",storeName:store.data?.name??"Unidade"}, correlation:{orderId:order.id,cartId:order.source_cart_id,checkoutSessionId:checkout.data?.id??order.checkout_session_id,customerId:order.customer_id}, whatsappChain, findings, timeline, payments:payments.data??[], delivery:delivery.data??null, printJobs:printJobs.data??[], failedPrintJobs:failedPrints };
  }
}
