import Link from "next/link";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../platform.module.css";

const severityLabel = { danger: "Crítica", warn: "Atenção", info: "Acompanhar" } as const;
const tone = { danger: "danger", warn: "warn", info: "good" } as const;

export default async function PlatformPendenciasPage() {
  const data = await PlatformBackofficeService.loadPendencies();
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>INÍCIO · CENTRAL DE PENDÊNCIAS</p>
          <h1>O que precisa da sua atenção</h1>
          <p>Uma fila única para cobrança, incidentes, integrações e follow-ups comerciais. A central não executa bloqueios automaticamente: ela mostra o risco e leva para o fluxo responsável.</p>
        </div>
        <span className={styles.roleBadge}>{data.role === "super_admin" ? "Gestão" : "Consulta"}</span>
      </header>

      <section className={styles.metrics} aria-label="Resumo das pendências">
        <Metric label="Críticas" value={data.counts.danger} helper="agir primeiro" />
        <Metric label="Atenção" value={data.counts.warn} helper="revisar hoje" />
        <Metric label="Acompanhar" value={data.counts.info} helper="follow-ups" />
        <Metric label="Total" value={data.rows.length} helper="itens consolidados" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Fila consolidada</h2><p>Ordenada primeiro por gravidade e depois pela ocorrência mais recente.</p></div>
        </div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <div className={styles.featureRow} key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.organizationName ? `${item.organizationName} · ` : ""}{item.detail}</small>
              </span>
              <span style={{ alignItems: "flex-end" }}>
                <span className={styles.pill} data-tone={tone[item.severity]}>{severityLabel[item.severity]}</span>
                <Link href={item.href} className={styles.open360}>Abrir responsável →</Link>
              </span>
            </div>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhuma pendência relevante agora.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}
