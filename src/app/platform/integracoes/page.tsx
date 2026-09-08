import Link from "next/link";
import { PlatformIntegrationHealthService, type IntegrationHealthState } from "@/server/platform/platform-integration-health-service";
import { PlatformIfoodHealthService } from "@/server/platform/platform-ifood-health-service";
import { PlatformOmnichannelHealthService } from "@/server/platform/platform-omnichannel-health-service";
import { PlatformOmnichannelSupportService } from "@/server/platform/platform-omnichannel-support-service";
import {
  reconcileExternalOrderAction,
  refreshOmnichannelHealthAction,
  reprocessIntegrationEventAction,
  retryIntegrationOutboxAction,
} from "./actions";
import styles from "@/app/platform/platform.module.css";
import healthStyles from "./integrations.module.css";

const stateLabels: Record<IntegrationHealthState, string> = {
  connected: "Conectado",
  attention: "Atenção",
  action_required: "Ação necessária",
  unavailable: "Indisponível",
  disconnected: "Desconectado",
};
const stateTones: Record<IntegrationHealthState, "good" | "warn" | "danger" | "neutral"> = {
  connected: "good",
  attention: "warn",
  action_required: "danger",
  unavailable: "danger",
  disconnected: "neutral",
};
const priority: Record<IntegrationHealthState, number> = {
  action_required: 0,
  unavailable: 1,
  attention: 2,
  disconnected: 3,
  connected: 4,
};
const capabilityLabels: Record<string, string> = {
  ifood_orders: "iFood · Pedidos",
  ifood_catalog: "iFood · Cardápio",
  ifood_shipping: "iFood · Entrega",
  "99food_orders": "99Food · Pedidos",
  "99food_menu": "99Food · Cardápio",
  "99food_logistics": "99Food · Logística",
  "99entrega": "99Entrega",
};
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function when(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "sem registro recente";
}

function lag(value: number | null) {
  if (value === null) return "sem eventos recentes";
  if (value < 60) return `${value}s`;
  return `${Math.floor(value / 60)} min`;
}

export default async function PlatformIntegrationsPage() {
  const [health, ifoodItems, omnichannel, support] = await Promise.all([
    PlatformIntegrationHealthService.load(),
    PlatformIfoodHealthService.load(),
    PlatformOmnichannelHealthService.load(),
    PlatformOmnichannelSupportService.loadQueue(),
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
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PAINEL DO PROPRIETÁRIO · SAÚDE</p>
          <h1>Integrações</h1>
          <p>Saúde operacional, filas, divergências e suporte seguro por unidade e capability, sem expor credenciais ou conteúdo técnico bruto.</p>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Resumo da saúde das integrações">
        <Metric label="Conectadas" value={totals.connected} helper="sem alerta recente" />
        <Metric label="Atenção" value={totals.attention} helper="degradação ou falha recente" />
        <Metric label="Ação necessária" value={totals.actionRequired} helper="configuração ou conexão incompleta" />
        <Metric label="Indisponíveis" value={totals.unavailable} helper="provider sem resposta" />
        <Metric label="Desconectadas" value={totals.disconnected} helper="recurso não conectado" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Saúde por unidade</h2>
            <p>O impacto explica se o problema bloqueia vendas, pagamentos, mensagens ou apenas uma automação auxiliar.</p>
          </div>
        </div>
        <div className={healthStyles.grid}>
          {items.map((item) => (
            <article key={item.key} className={healthStyles.card} data-state={item.state}>
              <div className={styles.cardTop}>
                <div className={healthStyles.title}>
                  <strong>{item.label}</strong>
                  <span className={styles.meta}>{item.organizationName} · {item.storeName}</span>
                </div>
                <span className={styles.pill} data-tone={stateTones[item.state]}>{stateLabels[item.state]}</span>
              </div>
              <p>{item.detail}</p>
              <div className={healthStyles.impact}><strong>Impacto</strong><span>{item.impact}</span></div>
              <div className={healthStyles.dates}><span>Último sucesso: {when(item.lastSuccessAt)}</span><span>Última falha: {when(item.lastFailureAt)}</span></div>
              {item.storeId ? <Link className={styles.open360} href={`/platform/unidades/${item.storeId}`}>Abrir restaurante 360° →</Link> : null}
            </article>
          ))}
          {items.length === 0 ? <div className={styles.empty}>Nenhuma integração encontrada.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Omnichannel por capability</h2>
            <p>Cada capability tem health independente. Desligar iFood Orders, por exemplo, não altera workflow, pedidos históricos ou outras integrações.</p>
          </div>
          <form action={refreshOmnichannelHealthAction}>
            <button className={healthStyles.actionButton} type="submit">Atualizar health e incidentes</button>
          </form>
        </div>
        <div className={healthStyles.compactMetrics}>
          <Metric label="Capabilities ativas" value={omnichannel.totals.enabled} helper="somente flags explicitamente ligadas" />
          <Metric label="Saudáveis" value={omnichannel.totals.healthy} helper="conexão e filas normais" />
          <Metric label="Com atenção" value={omnichannel.totals.attention} helper="degradação isolada" />
          <Metric label="Dead letters" value={omnichannel.totals.deadLetters} helper="exigem suporte" />
          <Metric label="Divergências" value={omnichannel.totals.divergences} helper="reconciliação segura" />
        </div>
        <div className={healthStyles.grid}>
          {omnichannel.items.map((item) => (
            <article key={item.key} className={healthStyles.card} data-state={item.state}>
              <div className={styles.cardTop}>
                <div className={healthStyles.title}>
                  <strong>{capabilityLabels[item.capability] ?? item.capability}</strong>
                  <span className={styles.meta}>{item.organizationName} · {item.storeName} · {item.environment}</span>
                </div>
                <span className={styles.pill} data-tone={stateTones[item.state]}>{item.enabled ? stateLabels[item.state] : "Desligada"}</span>
              </div>
              <div className={healthStyles.impact}><strong>Impacto</strong><span>{item.impact}</span></div>
              <div className={healthStyles.queueStats}>
                <span>Inbox: {item.inbox.pending} pend. · {item.inbox.retry} retry · {item.inbox.deadLetter} DLQ</span>
                <span>Outbox: {item.outbox.pending} pend. · {item.outbox.retry} retry · {item.outbox.deadLetter} DLQ</span>
                <span>Lag de ingestão: {lag(item.ingestionLagSeconds)}</span>
                <span>Divergências: {item.divergenceCount}</span>
              </div>
              <div className={healthStyles.dates}>
                <span>Último health: {when(item.lastHealthAt)}</span>
                <span>Evento recebido: {when(item.lastEventReceivedAt)}</span>
                <span>Evento processado: {when(item.lastEventProcessedAt)}</span>
              </div>
              {item.failureKind ? <p className={healthStyles.failureKind}>Classificação: {item.failureKind}</p> : null}
            </article>
          ))}
          {omnichannel.items.length === 0 ? <div className={styles.empty}>Nenhum merchant omnichannel vinculado.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Fila de suporte omnichannel</h2>
            <p>Somente operações idempotentes e auditadas. Esta central não permite digitar ou forçar status de pedido.</p>
          </div>
        </div>
        <div className={healthStyles.queueGrid}>
          {support.events.map((row) => (
            <article key={`event-${row.id}`} className={healthStyles.queueCard}>
              <strong>Inbox · {row.provider} · {row.capability}</strong>
              <span>{row.event_type} · {row.status} · tentativa {row.attempts}</span>
              <span>Evento: {row.external_event_id}</span>
              <span>Falha: {row.last_error_kind ?? "não classificada"}</span>
              <form action={reprocessIntegrationEventAction}>
                <input type="hidden" name="eventId" value={row.id} />
                <button className={healthStyles.actionButton} type="submit">Reprocessar evento</button>
              </form>
            </article>
          ))}
          {support.outbox.map((row) => (
            <article key={`outbox-${row.id}`} className={healthStyles.queueCard}>
              <strong>Outbox · {row.provider} · {row.capability}</strong>
              <span>{row.operation} · {row.status} · tentativa {row.attempts}</span>
              <span>Pedido: {row.order_id ?? "sem agregado"}</span>
              <span>Falha: {row.last_error_kind ?? "não classificada"}</span>
              <form action={retryIntegrationOutboxAction}>
                <input type="hidden" name="outboxId" value={row.id} />
                <button className={healthStyles.actionButton} type="submit">Retry seguro</button>
              </form>
            </article>
          ))}
          {support.divergent.map((row) => (
            <article key={`divergent-${row.id}`} className={healthStyles.queueCard}>
              <strong>Divergência · {row.provider}</strong>
              <span>Pedido externo: {row.external_order_id}</span>
              <span>Estado provider: {row.external_status ?? "desconhecido"} · sync {row.sync_status}</span>
              <span>Último evento: {row.last_external_event_id ?? "sem evento"}</span>
              <form action={reconcileExternalOrderAction}>
                <input type="hidden" name="externalOrderRowId" value={row.id} />
                <button className={healthStyles.actionButton} type="submit">Reconciliar estado conhecido</button>
              </form>
            </article>
          ))}
          {support.events.length + support.outbox.length + support.divergent.length === 0 ? (
            <div className={styles.empty}>Nenhum item em retry, dead-letter ou divergência.</div>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Como interpretar</h2><p>Esta central observa e oferece recuperação idempotente; não altera estado financeiro ou operacional e mantém pedidos nativos e outras lojas isolados.</p></div></div>
        <div className={styles.supportGrid}>
          <Info title="Conectado" text="Capability habilitada, conexão saudável e nenhum sinal de fila/divergência que exija atenção." />
          <Info title="Atenção" text="Existe retry, dead-letter, divergência ou lag. A falha permanece isolada à capability afetada." />
          <Info title="Ação necessária" text="Autenticação ou configuração precisa ser corrigida antes de a capability voltar a operar." />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>;
}

function Info({ title, text }: { title: string; text: string }) {
  return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>;
}
