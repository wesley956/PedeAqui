import { appendCrmActivityAction, saveCrmLeadAction } from "@/features/platform-backoffice/actions";
import { PlatformCrmService } from "@/server/platform/platform-crm-service";
import styles from "../platform.module.css";

const stageLabels: Record<string, string> = { new: "Novo", contacted: "Contato", demo: "Demonstração", proposal: "Proposta", won: "Ganho", lost: "Perdido" };
const money = (cents: number | null) => cents === null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Sem próxima ação";

export default async function PlatformComercialPage() {
  const data = await PlatformCrmService.load();
  const stages = ["new", "contacted", "demo", "proposal", "won", "lost"] as const;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>COMERCIAL · CRM</p>
          <h1>Funil de vendas do PedeAqui</h1>
          <p>Do primeiro contato até a conversão em empresa. O histórico de interações é imutável e as mudanças de etapa entram na auditoria global.</p>
        </div>
        <span className={styles.roleBadge}>{data.leads.filter((item) => !["won", "lost"].includes(item.stage)).length} oportunidade(s) abertas</span>
      </header>

      <section className={styles.metrics} aria-label="Funil comercial">
        {stages.slice(0, 5).map((stage) => <Metric key={stage} label={stageLabels[stage]} value={data.leads.filter((item) => item.stage === stage).length} />)}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Novo lead</h2><p>Cadastro manual para prospecção. Se a empresa já existir, ela pode ser vinculada desde o início.</p></div></div>
        <form action={saveCrmLeadAction} className={styles.formGrid}>
          <input className={styles.field} name="contactName" placeholder="Nome do contato" required />
          <input className={styles.field} name="businessName" placeholder="Nome do comércio" required />
          <input className={styles.field} name="phone" placeholder="WhatsApp / telefone" />
          <input className={styles.field} name="email" type="email" placeholder="E-mail" />
          <select className={styles.field} name="organizationId" defaultValue=""><option value="">Ainda não é cliente</option>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>
          <select className={styles.field} name="source" defaultValue="manual"><option value="manual">Manual</option><option value="indicacao">Indicação</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="site">Site</option></select>
          <select className={styles.field} name="stage" defaultValue="new">{stages.map((stage) => <option value={stage} key={stage}>{stageLabels[stage]}</option>)}</select>
          <input className={styles.field} name="estimatedMonthly" inputMode="decimal" placeholder="Receita mensal estimada (R$)" />
          <input className={styles.field} name="nextActionAt" type="datetime-local" />
          <input className={styles.field} name="notes" placeholder="Observação inicial" />
          <button className={styles.button} type="submit">Adicionar ao funil</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Oportunidades</h2><p>Para marcar como “Ganho”, vincule primeiro a empresa correspondente.</p></div></div>
        <div className={styles.featureList}>
          {data.leads.map((lead) => (
            <details className={styles.details} key={lead.id}>
              <summary>{lead.business_name} · {stageLabels[lead.stage] ?? lead.stage} · {money(lead.estimated_monthly_cents)}</summary>
              <div className={styles.detailsBody}>
                <div className={styles.featureRow}>
                  <span><strong>{lead.contact_name}</strong><small>{lead.phone || "Sem telefone"} · {lead.email || "Sem e-mail"}</small><small>Próxima ação: {dateTime(lead.next_action_at)}</small></span>
                  <span className={styles.pill} data-tone={lead.stage === "won" ? "good" : lead.stage === "lost" ? "danger" : "warn"}>{stageLabels[lead.stage] ?? lead.stage}</span>
                </div>
                {lead.notes ? <p className={styles.advancedNote}>{lead.notes}</p> : null}
                <form action={saveCrmLeadAction} className={styles.formGrid}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="contactName" value={lead.contact_name} />
                  <input type="hidden" name="businessName" value={lead.business_name} />
                  <input type="hidden" name="phone" value={lead.phone ?? ""} />
                  <input type="hidden" name="email" value={lead.email ?? ""} />
                  <input type="hidden" name="source" value={lead.source} />
                  <input type="hidden" name="estimatedMonthly" value={lead.estimated_monthly_cents === null ? "" : String(lead.estimated_monthly_cents / 100)} />
                  <input type="hidden" name="notes" value={lead.notes ?? ""} />
                  <select className={styles.field} name="organizationId" defaultValue={lead.organization_id ?? ""}><option value="">Ainda não vinculado</option>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>
                  <select className={styles.field} name="stage" defaultValue={lead.stage}>{stages.map((stage) => <option value={stage} key={stage}>{stageLabels[stage]}</option>)}</select>
                  <input className={styles.field} name="nextActionAt" type="datetime-local" />
                  <input className={styles.field} name="lostReason" placeholder="Motivo se perdido" defaultValue={lead.lost_reason ?? ""} />
                  <button className={styles.button} type="submit">Atualizar oportunidade</button>
                </form>
                <form action={appendCrmActivityAction} className={styles.formGrid}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <select className={styles.field} name="kind" defaultValue="note"><option value="note">Nota</option><option value="call">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="demo">Demonstração</option><option value="proposal">Proposta</option><option value="follow_up">Follow-up</option></select>
                  <input className={styles.field} name="summary" placeholder="Resumo da interação" required />
                  <button className={styles.button} type="submit">Registrar interação</button>
                </form>
              </div>
            </details>
          ))}
          {data.leads.length === 0 ? <div className={styles.empty}>Nenhum lead cadastrado.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Atividades recentes</h2><p>Registro cronológico do relacionamento comercial.</p></div></div>
        <div className={styles.featureList}>
          {data.activities.slice(0, 30).map((activity) => (
            <div className={styles.featureRow} key={activity.id}><span><strong>{activity.kind}</strong><small>{activity.summary}</small></span><small>{dateTime(activity.created_at)}</small></div>
          ))}
          {data.activities.length === 0 ? <div className={styles.empty}>As interações aparecerão aqui.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>oportunidade(s)</small></div>;
}
