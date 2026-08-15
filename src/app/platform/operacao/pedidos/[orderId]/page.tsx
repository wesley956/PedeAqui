import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformOrderDiagnosticService } from "@/server/platform/platform-order-diagnostic-service";
import styles from "@/app/platform/platform.module.css";

const dateTime=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"});
const money=(value:number)=> (value/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const toneMap={good:"good",warn:"warn",danger:"danger"} as const;

export default async function PlatformOrderDiagnosticPage({params}:{params:Promise<{orderId:string}>}){
 const {orderId}=await params; const data=await PlatformOrderDiagnosticService.load(orderId); if(!data)notFound();
 const order=data.order;
 return <div className={styles.page}>
  <div className={styles.breadcrumbs}><Link href="/platform/operacao">← Operação</Link><span>/</span><span>{order.organizationName}</span><span>/</span><strong>Pedido #{order.display_number}</strong></div>
  <header className={styles.hero}><div><p className={styles.eyebrow}>PEDIDO 360° · DIAGNÓSTICO</p><h1>Pedido #{order.display_number}</h1><p>{order.organizationName} · {order.storeName} · criado em {dateTime.format(new Date(order.created_at))}</p></div><span className={styles.roleBadge}>{money(Number(order.total_cents))}</span></header>
  <section className={styles.metrics}><Metric label="Pedido" value={order.order_status}/><Metric label="Pagamento" value={order.payment_status}/><Metric label="Produção" value={order.production_status}/><Metric label="Entrega/retirada" value={order.fulfillment_status}/><Metric label="Forma" value={order.payment_method_snapshot}/></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Diagnóstico automático</h2><p>O sistema aponta a etapa provável do bloqueio. Nenhum estado é alterado por esta análise.</p></div></div><div className={styles.readinessGrid}>{data.findings.map(f=><article key={f.key} className={styles.readinessCard} data-tone={f.tone}><div className={styles.cardTop}><strong>{f.title}</strong><span className={styles.pill} data-tone={toneMap[f.tone]}>{f.tone==="good"?"OK":f.tone==="danger"?"Crítico":"Atenção"}</span></div><p>{f.detail}</p></article>)}</div></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Timeline única</h2><p>Pedido, pagamento, produção, logística, impressão e eventos em ordem cronológica.</p></div></div><div className={styles.healthList}>{data.timeline.map(item=><div key={item.key} className={styles.healthRow}><span><strong>{item.domain} · {item.label}</strong><small>{item.detail}</small></span><span>{dateTime.format(new Date(item.occurredAt))}</span></div>)}</div></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Visões por domínio</h2><p>Leitura de suporte sem atalhos para pagamento ou state machines.</p></div></div><div className={styles.supportGrid}>
   <Info title="Pagamento" lines={data.payments.length?data.payments.map(p=>`${p.method} · ${p.status} · ${money(Number(p.amount_cents))}`):["Nenhum registro financeiro encontrado"]}/>
   <Info title="Logística" lines={data.delivery?[`Criada: ${dateTime.format(new Date(data.delivery.created_at))}`,data.delivery.assigned_at?`Atribuída: ${dateTime.format(new Date(data.delivery.assigned_at))}`:"Sem atribuição registrada",data.delivery.delivered_at?`Entregue: ${dateTime.format(new Date(data.delivery.delivered_at))}`:"Ainda não entregue"]:["Sem operação de entrega vinculada"]}/>
   <Info title="Impressão" lines={data.printJobs.length?data.printJobs.map(j=>`${j.document_type} · ${j.status} · tentativa ${j.attempts}/${j.max_attempts}`):["Nenhum job de impressão vinculado"]}/>
  </div></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Proteções</h2><p>Esta tela é diagnóstica. Pagamentos, produção e entrega continuam sob os serviços oficiais do PedeAqui.</p></div></div><p className={styles.advancedNote}>Não existe botão para forçar “pago”, “entregue” ou “concluído”. Reprocessamentos só serão disponibilizados quando houver operação idempotente segura para aquele domínio.</p></section>
 </div>;
}
function Metric({label,value}:{label:string;value:string}){return <article className={styles.metric}><span>{label}</span><strong style={{fontSize:15}}>{value}</strong><small>estado persistido</small></article>}
function Info({title,lines}:{title:string;lines:string[]}){return <article className={styles.supportCard}><strong>{title}</strong>{lines.map((line,index)=><span key={`${title}:${index}`}>{line}</span>)}</article>}
