import Link from "next/link";
import { PlatformIntegrationHealthService, type IntegrationHealthState } from "@/server/platform/platform-integration-health-service";
import { PlatformIfoodHealthService } from "@/server/platform/platform-ifood-health-service";
import styles from "@/app/platform/platform.module.css";
import healthStyles from "./integrations.module.css";

const stateLabels: Record<IntegrationHealthState, string> = { connected: "Conectado", attention: "Atenção", action_required: "Ação necessária", unavailable: "Indisponível", disconnected: "Desconectado" };
const stateTones: Record<IntegrationHealthState, "good" | "warn" | "danger" | "neutral"> = { connected: "good", attention: "warn", action_required: "danger", unavailable: "danger", disconnected: "neutral" };
const priority: Record<IntegrationHealthState, number> = { action_required: 0, unavailable: 1, attention: 2, disconnected: 3, connected: 4 };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
function when(value: string | null) { return value ? dateTime.format(new Date(value)) : "sem registro recente"; }

export default async function PlatformIntegrationsPage() {
  const [health, ifoodItems] = await Promise.all([
    PlatformIntegrationHealthService.load(),
    PlatformIfoodHealthService.load(),
  ]);
  const items = [...health.items, ...ifoodItems]
    .sort((a, b) => priority[a.state] - priority[b.state] || a.organizationName.localeCompare(b.organizationName) || a.storeName.localeCompare(b.storeName));
  const totals = {
    connected: items.filter((item) => item.state === "connected").length,
    attention: items.filter((item) => item.state === "attention").length,
    actionRequired: items.filter((item) => item.state === "action_required").length,
    unavailable: items.filter((item) => item.state === "unavailable").length,
    disconnected: items.filter((item) => item.state === "disconnected").length,
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}><div><p className={styles.eyebrow}>PAINEL DO PROPRIETÁRIO · SAÚDE</p><h1>Integrações</h1><p>Uma leitura operacional de WhatsApp, impressão, pagamentos, webhooks, iFood e cobrança da plataforma, sem expor credenciais.</p></div></header>
      <section className={styles.metrics} aria-label="Resumo da saúde das integrações">
        <Metric label="Conectadas" value={totals.connected} helper="sem alerta recente" /><Metric label="Atenção" value={totals.attention} helper="degradação ou falha recente" /><Metric label="Ação necessária" value={totals.actionRequired} helper="configuração ou conexão incompleta" /><Metric label="Indisponíveis" value={totals.unavailable} helper="provider sem resposta" /><Metric label="Desconectadas" value={totals.disconnected} helper="recurso não conectado" />
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Saúde por unidade</h2><p>O impacto explica se o problema bloqueia vendas, pagamentos, mensagens ou apenas uma automação auxiliar.</p></div></div>
        <div className={healthStyles.grid}>
          {items.map((item) => (
            <article key={item.key} className={healthStyles.card} data-state={item.state}>
              <div className={styles.cardTop}><div className={healthStyles.title}><strong>{item.label}</strong><span className={styles.meta}>{item.organizationName} · {item.storeName}</span></div><span className={styles.pill} data-tone={stateTones[item.state]}>{stateLabels[item.state]}</span></div>
              <p>{item.detail}</p>
              <div className={healthStyles.impact}><strong>Impacto</strong><span>{item.impact}</span></div>
              <div className={healthStyles.dates}><span>Último sucesso: {when(item.lastSuccessAt)}</span><span>Última falha: {when(item.lastFailureAt)}</span></div>
              {item.storeId ? <Link className={styles.open360} href={`/platform/unidades/${item.storeId}`}>Abrir restaurante 360° →</Link> : null}
            </article>
          ))}
          {items.length === 0 ? <div className={styles.empty}>Nenhuma integração encontrada.</div> : null}
        </div>
      </section>
      <section className={styles.section}><div className={styles.sectionHeader}><div><h2>Como interpretar</h2><p>Esta central não altera estado financeiro ou operacional por conta própria.</p></div></div><div className={styles.supportGrid}><Info title="Conectado" text="Configuração suficiente e nenhum sinal recente de falha detectado." /><Info title="Atenção" text="Existe falha recente ou degradação. A operação principal pode continuar, conforme o impacto exibido." /><Info title="Ação necessária" text="A conexão/configuração está incompleta ou um componente essencial não está saudável." /></div></section>
    </div>
  );
}
function Metric({ label, value, helper }: { label: string; value: number; helper: string }) { return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>; }
function Info({ title, text }: { title: string; text: string }) { return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>; }
