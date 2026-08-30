import Link from "next/link";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../platform.module.css";

const severityLabel = { danger: "Crítica", warn: "Atenção", info: "Acompanhar" } as const;
const tone = { danger: "danger", warn: "warn", info: "good" } as const;
const ownerOnlyDestinations = new Set(["/platform/comercial", "/platform/financeiro"]);

export default async function PlatformPendenciasPage() {
  const data = await PlatformBackofficeService.loadPendencies();
  const rows = data.role === "super_admin" ? data.rows : data.rows.filter((item) => !ownerOnlyDestinations.has(item.href));
  const counts = {
    danger: rows.filter((item) => item.severity === "danger").length,
    warn: rows.filter((item) => item.severity === "warn").length,
    info: rows.filter((item) => item.severity === "info").length,
  };
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>INÍCIO · CENTRAL DE PENDÊNCIAS</p>
          <h1>O que precisa da sua atenção</h1>
          <p>Uma fila única para cobrança, incidentes, integrações e follow-ups comerciais. A central não executa bloqueios automaticamente: ela mostra o risco e leva para o fluxo responsável.</p>
        </div>
        <span className={styles.roleBadge}>{data.role === "super_admin" ? "Gestão" : "Consulta operacional"}</span>
      </header>

      <section className={styles.metrics} aria-label="Resumo das pendências">
        <Metric label="Críticas" value={counts.danger} helper="agir primeiro" />
        <Metric label="Atenção" value={counts.warn} helper="revisar hoje" />
        <Metric label="Acompanhar" value={counts.info} helper={data.role === "super_admin" ? "follow-ups" : "operação"} />
        <Metric label="Total" value={rows.length} helper="itens visíveis" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Fila consolidada</h2><p>Ordenada primeiro por gravidade e depois pela ocorrência mais recente. Informações comerciais/financeiras são restritas ao proprietário.</p></div>
        </div>
        <div className={styles.featureList}>
          {rows.map((item) => (
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
          {rows.length === 0 ? <div className={styles.empty}>Nenhuma pendência relevante visível para este perfil agora.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}
