import { saveCustomerMessageAction } from "@/features/platform-governance/actions";
import { PlatformGovernanceService } from "@/server/platform/platform-governance-service";
import styles from "../platform.module.css";

const dateTime=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";

export default async function PlatformComunicacaoPage(){
  const data=await PlatformGovernanceService.loadCommunication();
  const orgName=new Map(data.organizations.map((o)=>[o.id,o.name]));
  return <div className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>CLIENTES · COMUNICAÇÃO</p><h1>Central de mensagens</h1><p>Prepare avisos de produto, onboarding, suporte e cobrança por cliente. O envio automático continua separado por canal e só será habilitado quando o provedor correspondente estiver configurado.</p></div><span className={styles.roleBadge}>{data.messages.filter((m)=>m.status==="draft"||m.status==="scheduled").length} preparada(s)</span></header>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Preparar mensagem</h2><p>Rascunhos não são enviados. “Agendada” apenas entra na fila até o dispatcher do canal estar habilitado.</p></div></div>
      <form action={saveCustomerMessageAction} className={styles.formGrid}>
        <select className={styles.field} name="organizationId" defaultValue="" required><option value="" disabled>Cliente</option>{data.organizations.map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <select className={styles.field} name="channel" defaultValue="panel"><option value="panel">Painel</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select>
        <select className={styles.field} name="kind" defaultValue="announcement"><option value="announcement">Aviso</option><option value="billing">Cobrança</option><option value="support">Suporte</option><option value="product">Produto</option><option value="onboarding">Onboarding</option><option value="other">Outro</option></select>
        <input className={styles.field} name="title" placeholder="Título" required />
        <input className={styles.field} name="body" placeholder="Mensagem" required />
        <select className={styles.field} name="status" defaultValue="draft"><option value="draft">Rascunho</option><option value="scheduled">Agendada</option><option value="cancelled">Cancelada</option></select>
        <input className={styles.field} name="scheduledAt" type="datetime-local" />
        <button className={styles.button}>Salvar mensagem</button>
      </form>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Histórico</h2><p>Mensagens preparadas e entregues por canal.</p></div></div>
      <div className={styles.featureList}>{data.messages.map((m)=><div className={styles.featureRow} key={m.id}><span><strong>{m.title}</strong><small>{orgName.get(m.organization_id)??"Cliente"} · {m.channel} · {m.kind}</small><small>{m.body.slice(0,180)}</small></span><span style={{alignItems:"flex-end"}}><span className={styles.pill} data-tone={m.status==="sent"?"good":m.status==="failed"?"danger":"warn"}>{m.status}</span><small>{m.status==="sent"?dateTime(m.sent_at):m.status==="scheduled"?dateTime(m.scheduled_at):dateTime(m.created_at)}</small></span></div>)}{data.messages.length===0?<div className={styles.empty}>Nenhuma mensagem preparada.</div>:null}</div>
    </section>
  </div>;
}
