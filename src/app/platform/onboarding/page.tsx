import { saveOnboardingTaskAction } from "@/features/platform-governance/actions";
import { PlatformGovernanceService } from "@/server/platform/platform-governance-service";
import styles from "../platform.module.css";

const statusLabel: Record<string,string> = { pending:"Pendente",in_progress:"Em andamento",done:"Concluído",blocked:"Bloqueado",waived:"Dispensado" };
const date = (value:string|null) => value ? new Date(value).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "—";

export default async function PlatformOnboardingPage(){
  const data=await PlatformGovernanceService.loadOnboarding();
  const orgName=new Map(data.organizations.map((item)=>[item.id,item.name]));
  const storeName=new Map(data.stores.map((item)=>[item.id,item.name]));
  return <div className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>CLIENTES · ONBOARDING</p><h1>Checklist de implantação</h1><p>Acompanhe cadastro, cardápio, impressão, entrega, treinamento, cobrança e demais passos sem depender de memória ou conversa solta.</p></div><span className={styles.roleBadge}>{data.tasks.filter((item)=>item.status!=="done"&&item.status!=="waived").length} passo(s) abertos</span></header>
    <section className={styles.metrics}>
      <Metric label="Pendentes" value={data.tasks.filter((i)=>i.status==="pending").length}/><Metric label="Em andamento" value={data.tasks.filter((i)=>i.status==="in_progress").length}/><Metric label="Bloqueados" value={data.tasks.filter((i)=>i.status==="blocked").length}/><Metric label="Concluídos" value={data.tasks.filter((i)=>i.status==="done").length}/>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Novo passo</h2><p>O checklist é flexível por cliente e unidade.</p></div></div>
      <form action={saveOnboardingTaskAction} className={styles.formGrid}>
        <select className={styles.field} name="organizationId" required defaultValue=""><option value="" disabled>Empresa</option>{data.organizations.map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <select className={styles.field} name="storeId" defaultValue=""><option value="">Empresa inteira</option>{data.stores.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input className={styles.field} name="stepKey" placeholder="chave: cardapio_pronto" required />
        <input className={styles.field} name="label" placeholder="Descrição do passo" required />
        <select className={styles.field} name="status" defaultValue="pending"><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="done">Concluído</option><option value="blocked">Bloqueado</option><option value="waived">Dispensado</option></select>
        <input className={styles.field} name="dueAt" type="datetime-local" />
        <input className={styles.field} name="note" placeholder="Observação" />
        <button className={styles.button}>Salvar passo</button>
      </form>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Passos cadastrados</h2><p>Histórico operacional da implantação por empresa.</p></div></div>
      <div className={styles.featureList}>{data.tasks.map((task)=><div className={styles.featureRow} key={task.id}><span><strong>{task.label}</strong><small>{orgName.get(task.organization_id)??"Empresa"}{task.store_id?` · ${storeName.get(task.store_id)??"Unidade"}`:" · empresa inteira"} · prazo {date(task.due_at)}</small>{task.note?<small>{task.note}</small>:null}</span><span className={styles.pill} data-tone={task.status==="done"?"good":task.status==="blocked"?"danger":"warn"}>{statusLabel[task.status]??task.status}</span></div>)}{data.tasks.length===0?<div className={styles.empty}>Nenhum passo cadastrado.</div>:null}</div>
    </section>
  </div>;
}
function Metric({label,value}:{label:string;value:number}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>passo(s)</small></div>}
