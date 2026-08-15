import Link from "next/link";
import { PlatformOrderDiagnosticService } from "@/server/platform/platform-order-diagnostic-service";
import styles from "@/app/platform/platform.module.css";

const dateTime=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"});
const label:Record<string,string>={pending_confirmation:"Aguardando confirmação",confirmed:"Confirmado",rejected:"Rejeitado",canceled:"Cancelado",completed:"Concluído",pending:"Pendente",authorized:"Autorizado",paid:"Pago",failed:"Falhou",refunded:"Estornado"};

export default async function PlatformOperationPage(){
 const orders=await PlatformOrderDiagnosticService.listRecent(150);
 return <div className={styles.page}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>PAINEL DO PROPRIETÁRIO · OPERAÇÃO</p><h1>Diagnóstico de pedidos</h1><p>Encontre a etapa em que um pedido parou usando somente a timeline operacional.</p></div></header>
  <section className={styles.section}>
   <div className={styles.sectionHeader}><div><h2>Pedidos recentes</h2><p>Fila de suporte com estados e horários necessários para investigação.</p></div></div>
   <div className={styles.order360List}>
    {orders.map(order=><Link key={order.id} className={styles.orgCardLink} href={`/platform/operacao/pedidos/${order.id}`}><article className={styles.order360Row}>
     <div><strong>Pedido #{order.display_number}</strong><span>{order.organizationName} · {order.storeName} · {dateTime.format(new Date(order.created_at))}</span></div>
     <div className={styles.order360States}><span>{label[order.order_status]??order.order_status}</span><span>{label[order.payment_status]??order.payment_status}</span><span>{order.production_status}</span><span>{order.fulfillment_status}</span></div>
     <span className={styles.open360}>Abrir diagnóstico →</span>
    </article></Link>)}
    {orders.length===0?<div className={styles.empty}>Nenhum pedido recente.</div>:null}
   </div>
  </section>
 </div>;
}
