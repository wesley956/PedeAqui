import { randomUUID } from "node:crypto";
import {
  activateSubscriptionAction,
  applyGracePeriodAction,
  cancelSubscriptionNowAction,
  changePlanAction,
  scheduleCancellationAction,
  startOrExtendTrialAction,
} from "@/features/platform-commercial-billing/actions";
import { PlatformCommercialBillingService } from "@/server/platform/platform-commercial-billing-service";
import styles from "../platform.module.css";

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Não definido";

export default async function PlatformSubscriptionsPage() {
  const data = await PlatformCommercialBillingService.load();
  const activePlans = data.plans.filter((plan) => plan.active);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CLIENTES E RECEITA</p>
          <h1>Planos e assinaturas</h1>
          <p>Administre testes, planos e ciclo comercial do PedeAqui por ações controladas, com histórico e sem editar estados internos do banco.</p>
        </div>
        <span className={styles.roleBadge}>{data.canManage ? "Gestão comercial" : "Consulta de suporte"}</span>
      </section>

      <section className={styles.metrics} aria-label="Resumo comercial">
        <Metric label="Clientes ativos" value={data.metrics.active} helper="assinaturas em operação" />
        <Metric label="Em teste" value={data.metrics.trials} helper="períodos de avaliação" />
        <Metric label="Cobrança em atenção" value={data.metrics.attention} helper="exigem análise" />
        <Metric label="Cancelamento agendado" value={data.metrics.scheduledCancellation} helper="ao fim do período" />
        <Metric label="Falhas de billing" value={data.metrics.billingFailures} helper="eventos recentes" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Planos comerciais</h2><p>Recursos são apresentados pelo nome usado no produto; identificadores internos não aparecem nesta área.</p></div>
        </div>
        <div className={styles.planGrid}>
          {data.plans.map((plan) => (
            <article className={styles.planCard} key={plan.id}>
              <div className={styles.cardTop}><strong>{plan.name}</strong><span className={styles.pill} data-tone={plan.active ? "good" : "neutral"}>{plan.active ? "Disponível para novas vendas" : "Fora de venda"}</span></div>
              {plan.description ? <span className={styles.meta}>{plan.description}</span> : null}
              <div className={styles.featureList}>
                {plan.features.slice(0, 8).map((feature) => <div className={styles.featureRow} key={`${plan.id}:${feature.name}`}><span>{feature.name}</span><strong>{feature.limitLabel}</strong></div>)}
                {plan.features.length === 0 ? <div className={styles.empty}>Nenhum recurso comercial habilitado.</div> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Clientes e ciclo da assinatura</h2><p>As ações disponíveis dependem da situação atual e continuam passando pela state machine financeira oficial.</p></div>
        </div>
        {data.subscriptions.length === 0 ? <p className={styles.empty}>Ainda não existem assinaturas registradas.</p> : (
          <div className={styles.orgGrid}>
            {data.subscriptions.map((subscription) => (
              <article className={styles.orgCard} key={subscription.id}>
                <div className={styles.cardTop}>
                  <div><strong>{subscription.organizationName}</strong><span>{subscription.planName} · {subscription.intervalLabel}</span></div>
                  <span className={styles.pill} data-tone={subscription.status === "active" ? "good" : subscription.status === "past_due" ? "danger" : subscription.status === "trialing" ? "warn" : "neutral"}>{subscription.statusLabel}</span>
                </div>
                <p className={styles.meta}>Fim do período: {dateTime(subscription.currentPeriodEnd)}</p>
                {subscription.trialEndsAt ? <p className={styles.meta}>Teste até: {dateTime(subscription.trialEndsAt)}</p> : null}
                {subscription.graceEndsAt ? <p className={styles.meta}>Tolerância até: {dateTime(subscription.graceEndsAt)}</p> : null}
                {subscription.cancelAtPeriodEnd ? <p className={styles.advancedNote}>Cancelamento já agendado para o fim do período.</p> : null}
                <p className={styles.meta}>Cobrança externa: {subscription.hasProvider ? "provider conectado" : "gestão manual/sem provider"}</p>

                {data.canManage && ["trialing", "active", "past_due"].includes(subscription.status) ? (
                  <details className={styles.details}>
                    <summary>Alterar plano mantendo o ciclo atual</summary>
                    <form action={changePlanAction} className={styles.detailsBody}>
                      <Common organizationId={subscription.organizationId} />
                      <PlanFields plans={activePlans} selectedPlanId={subscription.planId} selectedInterval={subscription.billingInterval} />
                      <button className={styles.button}>Aplicar mudança de plano</button>
                    </form>
                  </details>
                ) : null}

                {data.canManage && subscription.status === "trialing" ? (
                  <details className={styles.details}>
                    <summary>Estender período de teste</summary>
                    <form action={startOrExtendTrialAction} className={styles.detailsBody}>
                      <Common organizationId={subscription.organizationId} />
                      <PlanFields plans={activePlans} selectedPlanId={subscription.planId} selectedInterval={subscription.billingInterval} />
                      <label>Nova data final do teste<input className={styles.field} name="trialEndsAt" type="datetime-local" required /></label>
                      <button className={styles.button}>Estender teste</button>
                    </form>
                  </details>
                ) : null}

                {data.canManage && ["trialing", "past_due"].includes(subscription.status) ? (
                  <details className={styles.details}>
                    <summary>Ativar assinatura</summary>
                    <form action={activateSubscriptionAction} className={styles.detailsBody}>
                      <Common organizationId={subscription.organizationId} />
                      <PlanFields plans={activePlans} selectedPlanId={subscription.planId} selectedInterval={subscription.billingInterval} />
                      <button className={styles.button}>Ativar pelo fluxo oficial</button>
                    </form>
                  </details>
                ) : null}

                {data.canManage && ["trialing", "active", "past_due"].includes(subscription.status) ? (
                  <>
                    <details className={styles.details}>
                      <summary>Aplicar período de tolerância</summary>
                      <form action={applyGracePeriodAction} className={styles.detailsBody}>
                        <Common organizationId={subscription.organizationId} />
                        <label>Tolerância até<input className={styles.field} name="graceEndsAt" type="datetime-local" required /></label>
                        <button className={styles.button}>Aplicar tolerância</button>
                      </form>
                    </details>
                    {!subscription.cancelAtPeriodEnd ? <details className={styles.details}>
                      <summary>Agendar cancelamento no fim do período</summary>
                      <form action={scheduleCancellationAction} className={styles.detailsBody}>
                        <Common organizationId={subscription.organizationId} />
                        <p className={styles.advancedNote}>A assinatura continua válida até o fim do período atual. Nenhum encerramento imediato é feito por esta ação.</p>
                        <button className={styles.button}>Agendar cancelamento</button>
                      </form>
                    </details> : null}
                    <details className={styles.details}>
                      <summary>Cancelar imediatamente</summary>
                      <form action={cancelSubscriptionNowAction} className={styles.detailsBody}>
                        <Common organizationId={subscription.organizationId} />
                        <label>Confirmação<input className={styles.field} name="cancelConfirmation" value="CANCELAR" readOnly /></label>
                        <p className={styles.advancedNote}>Use apenas quando a decisão comercial já estiver confirmada. A ação passa pela state machine e fica registrada no histórico.</p>
                        <button className={styles.button}>Cancelar assinatura</button>
                      </form>
                    </details>
                  </>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {data.canManage ? (
          <details className={styles.details}>
            <summary>Iniciar teste ou ativar empresa sem assinatura vigente</summary>
            <div className={styles.detailsBody}>
              <form action={startOrExtendTrialAction} className={styles.detailsBody}>
                <strong>Iniciar período de teste</strong>
                <NewSubscriptionCommon organizations={data.organizations} />
                <PlanFields plans={activePlans} />
                <label>Teste até<input className={styles.field} name="trialEndsAt" type="datetime-local" required /></label>
                <button className={styles.button}>Iniciar teste</button>
              </form>
              <form action={activateSubscriptionAction} className={styles.detailsBody}>
                <strong>Ativar diretamente</strong>
                <NewSubscriptionCommon organizations={data.organizations} />
                <PlanFields plans={activePlans} />
                <button className={styles.button}>Ativar assinatura</button>
              </form>
            </div>
          </details>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Histórico comercial</h2><p>Cada transição registra origem, destino, motivo e protocolo quando informados.</p></div></div>
        <div className={styles.featureList}>
          {data.history.slice(0, 30).map((item) => <div className={styles.featureRow} key={item.id}><span><strong>{item.organizationName}</strong><small>{item.fromLabel} → {item.toLabel} · {item.reason}{item.protocol ? ` · ${item.protocol}` : ""}</small></span><strong>{dateTime(item.createdAt)}</strong></div>)}
          {data.history.length === 0 ? <div className={styles.empty}>O histórico comercial começará a aparecer nas próximas alterações oficiais.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Saúde da cobrança</h2><p>Diagnóstico técnico sanitizado. Payloads, tokens e identificadores de cobrança não são exibidos.</p></div><span className={styles.pill} data-tone={data.metrics.billingFailures ? "danger" : "good"}>{data.metrics.billingFailures ? `${data.metrics.billingFailures} falha(s)` : "Sem falhas recentes"}</span></div>
        <div className={styles.featureList}>
          {data.billingEvents.slice(0, 20).map((item) => <div className={styles.featureRow} key={item.id}><span><strong>{item.provider}</strong><small>{item.statusLabel}{item.error ? ` · ${item.error}` : ""}</small></span><strong>{dateTime(item.processedAt ?? item.createdAt)}</strong></div>)}
          {data.billingEvents.length === 0 ? <div className={styles.empty}>Nenhum evento recente de cobrança.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>;
}

function Common({ organizationId }: { organizationId: string }) {
  return <>
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="idempotencyKey" value={`commercial-subscription:${randomUUID()}`} />
    <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: ajuste comercial confirmado com o cliente" /></label>
    <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: COM-2026-001" /></label>
  </>;
}

function NewSubscriptionCommon({ organizations }: { organizations: Array<{ id: string; name: string }> }) {
  return <>
    <select className={styles.field} name="organizationId" required defaultValue=""><option value="" disabled>Selecione a empresa</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
    <input type="hidden" name="idempotencyKey" value={`commercial-subscription:${randomUUID()}`} />
    <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: contratação aprovada" /></label>
    <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: COM-2026-001" /></label>
  </>;
}

function PlanFields({ plans, selectedPlanId, selectedInterval = "month" }: { plans: Array<{ id: string; name: string }>; selectedPlanId?: string; selectedInterval?: string }) {
  return <>
    <label>Plano<select className={styles.field} name="planId" required defaultValue={selectedPlanId ?? ""}><option value="" disabled>Selecione o plano</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
    <label>Periodicidade<select className={styles.field} name="billingInterval" defaultValue={selectedInterval}><option value="month">Mensal</option><option value="year">Anual</option><option value="manual">Manual</option></select></label>
  </>;
}
