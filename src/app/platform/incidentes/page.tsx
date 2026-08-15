import { setIncidentLifecycleAction } from "@/features/platform-incidents/actions";
import { PlatformIncidentService } from "@/server/platform/platform-incident-service";
import styles from "../platform.module.css";

const dt = (value: string) => new Date(value).toLocaleString("pt-BR");
const statusLabel: Record<string,string> = { open: "Aberto", investigating: "Investigando", resolved: "Resolvido" };

export default async function PlatformIncidentsPage() {
  const data = await PlatformIncidentService.load();
  return <div className={styles.page}>
    <section className={styles.hero}><div><p className={styles.eyebrow}>SAÚDE DA PLATAFORMA</p><h1>Incidentes e auditoria</h1><p>Falhas recorrentes agrupadas e sanitizadas, com clientes afetados, frequência, ciclo de investigação e trilha de intervenções.</p></div></section>
    <section className={styles.metrics}>
      <Metric label="Abertos" value={data.totals.open}/><Metric label="Investigando" value={data.totals.investigating}/><Metric label="P0/P1 ativos" value={data.totals.p0p1}/><Metric label="Resolvidos" value={data.totals.resolved}/>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Incidentes</h2><p>Erros iguais são agrupados por causa e contexto. Nenhum payload bruto, segredo ou dado pessoal é mostrado.</p></div></div>
      <div className={styles.orgGrid}>{data.incidents.map((item) => <article className={styles.orgCard} key={item.fingerprint}>
        <div className={styles.cardTop}><div><strong>{item.title}</strong><span>{item.category} · {item.organizationName}{item.storeName ? ` · ${item.storeName}` : ""}</span></div><span className={styles.pill} data-tone={item.severity === "P0" || item.severity === "P1" ? "danger" : item.severity === "P2" ? "warn" : "neutral"}>{item.severity} · {statusLabel[item.status]}</span></div>
        <p className={styles.meta}>{item.summary}</p><p className={styles.meta}>{item.occurrenceCount} ocorrência(s) · primeira {dt(item.firstSeenAt)} · última {dt(item.lastSeenAt)}</p>
        {item.internalNote ? <p className={styles.advancedNote}>Nota interna: {item.internalNote}</p> : null}
        <details className={styles.details}><summary>Atualizar investigação</summary><form action={setIncidentLifecycleAction} className={styles.detailsBody}>
          {Object.entries({ fingerprint:item.fingerprint,severity:item.severity,category:item.category,title:item.title,summary:item.summary,sourceKind:item.sourceKind,sourceReference:item.sourceReference ?? "",organizationId:item.organizationId ?? "",storeId:item.storeId ?? "",occurrenceCount:String(item.occurrenceCount),firstSeenAt:item.firstSeenAt,lastSeenAt:item.lastSeenAt }).map(([name,value]) => <input key={name} type="hidden" name={name} value={value}/>) }
          <label>Situação<select className={styles.field} name="status" defaultValue={item.status}><option value="open">Aberto</option><option value="investigating">Investigando</option><option value="resolved">Resolvido</option></select></label>
          <label>Nota interna<input className={styles.field} name="note" minLength={3} maxLength={1000} required placeholder="Diagnóstico, ação tomada ou motivo da resolução"/></label>
          <button className={styles.button}>Registrar atualização</button>
        </form></details>
      </article>)}</div>
      {data.incidents.length === 0 ? <p className={styles.empty}>Nenhum incidente conhecido neste momento.</p> : null}
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Trilha de auditoria</h2><p>Intervenções administrativas com antes/depois sanitizado e correlação, sem PII ou credenciais.</p></div></div>
      <div className={styles.featureList}>{data.auditRows.slice(0,80).map((row) => <div className={styles.featureRow} key={row.id}><span><strong>{row.action}</strong><small>{row.organizationName}{row.storeName ? ` · ${row.storeName}` : ""} · {row.entityType}{row.requestId ? ` · ${row.requestId}` : ""}</small></span><strong>{dt(row.createdAt)}</strong></div>)}</div>
    </section>
  </div>;
}
function Metric({label,value}:{label:string;value:number}) { return <article className={styles.metric}><span>{label}</span><strong>{value}</strong></article>; }
