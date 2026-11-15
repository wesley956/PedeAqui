import Link from "next/link";
import { PlatformOrderDiagnosticService } from "@/server/platform/platform-order-diagnostic-service";
import styles from "@/app/platform/platform.module.css";

const dateTime=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"});
const label:Record<string,string>={pending_confirmation:"Aguardando confirmação",confirmed:"Confirmado",rejected:"Rejeitado",canceled:"Cancelado",completed:"Concluído",pending:"Pendente",authorized:"Autorizado",paid:"Pago",failed:"Falhou",refunded:"Estornado"};

// Etapas em português: antes apareciam os códigos internos ("pending_confirmation", "pending").
const productionLabel:Record<string,string>={pending_confirmation:"Produção: aguardando confirmação",queued:"Produção: na fila",preparing:"Produção: em preparo",ready:"Produção: pronto",canceled:"Produção: cancelada",not_required:"Sem produção"};
const fulfillmentLabel:Record<string,string>={pending:"Entrega/retirada: pendente",awaiting_assignment:"Aguardando entregador",assigned:"Entregador definido",picked_up:"Retirado pelo entregador",out_for_delivery:"Saiu para entrega",delivered:"Entregue",awaiting_pickup:"Aguardando retirada",picked_up_by_customer:"Retirado pelo cliente",served:"Servido",canceled:"Entrega/retirada cancelada",not_required:"Sem entrega ou retirada"};
export default async function PlatformOperationPage(){
 const orders=await PlatformOrderDiagnosticService.listRecent(150);
 return <div className={styles.page}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>PAINEL DO PROPRIETÁRIO · OPERAÇÃO</p><h1>Diagnóstico de pedidos</h1><p>Encontre a etapa em que um pedido parou usando somente a timeline operacional.</p></div></header>
  <section className={styles.section}>
   <div className={styles.sectionHeader}><div><h2>Pedidos recentes</h2><p>Fila de suporte com estados e horários necessários para investigação.</p></div></div>
   <div className={styles.order360List}>
    {orders.map(order=><Link key={order.id} className={styles.orgCardLink} href={`/platform/operacao/pedidos/${order.id}`}><article className={styles.order360Row}>
     <div><strong>Pedido #{order.display_number}</strong><span>{order.organizationName} · {order.storeName} · {dateTime.format(new Date(order.created_at))}</span></div>
     <div className={styles.order360States}><span>{label[order.order_status]??order.order_status}</span><span>{label[order.payment_status]??order.payment_status}</span><span>{productionLabel[order.production_status]??order.production_status}</span><span>{fulfillmentLabel[order.fulfillment_status]??order.fulfillment_status}</span></div>
     <span className={styles.open360}>Abrir diagnóstico →</span>
    </article></Link>)}
    {orders.length===0?<div className={styles.empty}>Nenhum pedido recente.</div>:null}
   </div>
  </section>
 </div>;
}
