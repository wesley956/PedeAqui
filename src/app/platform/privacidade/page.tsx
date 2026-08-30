import { createPrivacyRequestAction } from "@/features/platform-governance/actions";
import { PlatformGovernanceService } from "@/server/platform/platform-governance-service";
import styles from "../platform.module.css";

const dateTime=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";

export default async function PlatformPrivacidadePage(){
  const data=await PlatformGovernanceService.loadSettingsAndPrivacy();
  const orgName=new Map(data.organizations.map((o)=>[o.id,o.name]));
  return <div className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>SUPORTE E PLATAFORMA · PRIVACIDADE</p><h1>LGPD, retenção e solicitações</h1><p>A central registra pedidos e políticas, mas não apaga/anomiza dados automaticamente. Toda eliminação futura precisa respeitar obrigação legal, retenção financeira e auditoria.</p></div><span className={styles.roleBadge}>{data.privacy.filter((r)=>!['completed','cancelled','rejected'].includes(r.status)).length} solicitação(ões) abertas</span></header>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Nova solicitação</h2><p>Cria protocolo rastreável para acesso, exportação, correção, anonimização ou exclusão.</p></div></div>
      <form action={createPrivacyRequestAction} className={styles.formGrid}>
        <select className={styles.field} name="organizationId" defaultValue=""><option value="">Sem empresa vinculada</option>{data.organizations.map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <input className={styles.field} name="requesterReference" placeholder="Referência do solicitante" />
        <select className={styles.field} name="requestType" defaultValue="access"><option value="access">Acesso</option><option value="export">Exportação</option><option value="correction">Correção</option><option value="anonymization">Anonimização</option><option value="deletion">Exclusão</option><option value="other">Outro</option></select>
        <input className={styles.field} name="reason" placeholder="Descrição da solicitação" required />
        <button className={styles.button}>Registrar protocolo</button>
      </form>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Políticas de retenção</h2><p>Todas começam em revisão/inativas; nenhuma exclusão automática é executada sem definição jurídica e operacional.</p></div></div>
      <div className={styles.featureList}>{data.retention.map((p)=><div className={styles.featureRow} key={p.id}><span><strong>{p.name}</strong><small>{p.description}</small><small>{p.legal_basis||"Base legal ainda não registrada"}</small></span><span style={{alignItems:"flex-end"}}><span className={styles.pill} data-tone={p.active?"good":"warn"}>{p.active?"Ativa":"Revisar"}</span><strong>{p.retention_days?`${p.retention_days} dias`:"Prazo não definido"}</strong></span></div>)}</div>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Solicitações registradas</h2><p>Fila operacional de privacidade.</p></div></div>
      <div className={styles.featureList}>{data.privacy.map((r)=><div className={styles.featureRow} key={r.id}><span><strong>{r.request_type} · {r.protocol}</strong><small>{r.organization_id?(orgName.get(r.organization_id)??"Empresa"):"Sem empresa"} · solicitado em {dateTime(r.requested_at)}</small><small>{r.reason}</small></span><span style={{alignItems:"flex-end"}}><span className={styles.pill} data-tone={r.status==="completed"?"good":r.status==="rejected"||r.status==="cancelled"?"danger":"warn"}>{r.status}</span>{r.legal_hold?<small>legal hold ativo</small>:null}</span></div>)}{data.privacy.length===0?<div className={styles.empty}>Nenhuma solicitação registrada.</div>:null}</div>
    </section>
  </div>;
}
