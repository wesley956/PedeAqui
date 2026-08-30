import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../platform.module.css";

const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function PlatformAuditoriaPage() {
  const data = await PlatformBackofficeService.loadAudit();
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>SUPORTE E PLATAFORMA · AUDITORIA</p>
          <h1>Trilha global de alterações</h1>
          <p>Une eventos operacionais, financeiros e administrativos sem apagar o histórico original. Use protocolo, entidade e cliente para reconstruir o que aconteceu.</p>
        </div>
        <span className={styles.roleBadge}>{data.rows.length} eventos recentes</span>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Eventos recentes</h2><p>A visualização é somente leitura. Históricos financeiros e do Clube Fundadores permanecem imutáveis.</p></div></div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <div className={styles.featureRow} key={`${item.source}:${item.id}`}>
              <span>
                <strong>{item.action}</strong>
                <small>{item.source} · {item.entity_type}{item.organizationName ? ` · ${item.organizationName}` : ""} · {dateTime(item.created_at)}</small>
                {item.reason ? <small>{item.reason}</small> : null}
              </span>
              <span style={{ alignItems: "flex-end" }}>
                <span className={styles.pill}>{item.source}</span>
                {(item.protocol || item.request_id) ? <small>{item.protocol || item.request_id}</small> : null}
              </span>
            </div>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhum evento de auditoria encontrado.</div> : null}
        </div>
      </section>
    </div>
  );
}
