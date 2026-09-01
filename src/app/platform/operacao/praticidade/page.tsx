import { PlatformProductExperienceService } from "@/server/platform/platform-product-experience-service";
import styles from "@/app/platform/platform.module.css";

const date=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"});
const percent=(value:number|null)=>value==null?"Não medido":`${Math.round(value*100)}%`;
const decimal=(value:number|null)=>value==null?"Não medido":value.toLocaleString("pt-BR",{maximumFractionDigits:1});
const duration=(value:number|null)=>value==null?"Não medido":value<1000?`${value} ms`:`${(value/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})} s`;

export default async function ProductExperiencePage(){
 const pilots=await PlatformProductExperienceService.loadPilots();
 return <div className={styles.page}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>OPERAÇÃO · BASELINE</p><h1>Praticidade dos clientes-piloto</h1><p>Compara períodos de 14 dias sem conteúdo de pedidos, endereço, conversa ou dados financeiros.</p></div></header>
  {pilots.map(pilot=><section className={styles.section} key={pilot.id}>
   <div className={styles.sectionHeader}><div><h2>{pilot.name}</h2><p>Primeiro pedido: {pilot.firstOrderAt?date.format(new Date(pilot.firstOrderAt)):"ainda não registrado"} · quinto pedido: {pilot.fifthOrderAt?date.format(new Date(pilot.fifthOrderAt)):"ainda não registrado"}</p></div><span className={styles.pill} data-tone={pilot.measurementStartedAt?"good":"warn"}>{pilot.measurementStartedAt?`Medição desde ${date.format(new Date(pilot.measurementStartedAt))}`:"Interações ainda não medidas"}</span></div>
   <div className={styles.metrics}>
    <Metric label="Pedidos no período" current={String(pilot.current.orders)} previous={String(pilot.previous.orders)}/>
    <Metric label="Conclusão" current={percent(pilot.current.completionRate)} previous={percent(pilot.previous.completionRate)}/>
    <Metric label="Ações por conclusão" current={decimal(pilot.current.actionsPerCompletedOrder)} previous={decimal(pilot.previous.actionsPerCompletedOrder)}/>
    <Metric label="Tempo por ação" current={duration(pilot.current.averageActionDurationMs)} previous={duration(pilot.previous.averageActionDurationMs)}/>
    <Metric label="Falhas / recuperações ao vivo" current={`${pilot.current.realtimeFailures} / ${pilot.current.realtimeRecoveries}`} previous={`${pilot.previous.realtimeFailures} / ${pilot.previous.realtimeRecoveries}`}/>
   </div>
   <div className={styles.healthSummary}>
    <Health label="Checkouts iniciados" current={pilot.current.checkoutStarted} previous={pilot.previous.checkoutStarted}/>
    <Health label="Checkouts abandonados" current={pilot.current.checkoutAbandoned} previous={pilot.previous.checkoutAbandoned}/>
    <HealthText label="Taxa de abandono" current={percent(pilot.current.checkoutAbandonmentRate)} previous={percent(pilot.previous.checkoutAbandonmentRate)}/>
    <Health label="Impressões com falha" current={pilot.current.printFailures} previous={pilot.previous.printFailures}/>
    <Health label="Recuperações de impressão" current={pilot.current.printRecoveries} previous={pilot.previous.printRecoveries}/>
    <Health label="Pedidos históricos" current={pilot.totalOrders} previous={null}/>
   </div>
  </section>)}
  {pilots.length===0?<section className={styles.section}><div className={styles.empty}>Os clientes-piloto não foram localizados pelos nomes configurados. Nenhum dado foi alterado.</div></section>:null}
  <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Limites honestos do baseline</h2><p>Cliques, tempo por ação, Realtime, abandono e pausas anteriores à instrumentação aparecem como “Não medido”. Pedidos e impressão históricos são derivados das fontes autoritativas existentes.</p></div></div></section>
 </div>;
}
function Metric({label,current,previous}:{label:string;current:string;previous:string}){return <article className={styles.metric}><span>{label}</span><strong>{current}</strong><small>14 dias anteriores: {previous}</small></article>;}
function Health({label,current,previous,suffix=""}:{label:string;current:number;previous:number|null;suffix?:string}){return <article className={styles.healthCard}><strong>{current}{suffix}</strong><span>{label}{previous==null?"":` · antes: ${previous}${suffix}`}</span></article>;}
function HealthText({label,current,previous}:{label:string;current:string;previous:string}){return <article className={styles.healthCard}><strong>{current}</strong><span>{label} · antes: {previous}</span></article>;}
