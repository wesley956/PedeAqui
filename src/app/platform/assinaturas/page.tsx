import { randomUUID } from "node:crypto";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  activateSubscriptionAction,
  applySubscriptionAdjustmentAction,
  applyGracePeriodAction,
  assignFounderPlanAction,
  cancelSubscriptionAdjustmentAction,
  cancelSubscriptionNowAction,
  changePlanAction,
  recordSubscriptionPaymentAction,
  saveCommercialPlanAction,
  saveSubscriptionInvoiceAction,
  scheduleCancellationAction,
  setSubscriptionAccessAction,
  startOrExtendTrialAction,
  updateCommercialTermsAction,
} from "@/features/platform-commercial-billing/actions";
import { PlatformCommercialBillingService } from "@/server/platform/platform-commercial-billing-service";
import styles from "../platform.module.css";

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Não definido";
const money = (value: number | null) => value === null ? "Valor ainda não definido" : (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
        <Metric label="Receita mensal prevista" value={money(data.metrics.projectedRevenueCents)} helper="assinaturas ativas" />
        <Metric label="Valor em atraso" value={money(data.metrics.overdueAmountCents)} helper="mensalidades vencidas" />
        <Metric label="Vencem em 7 dias" value={data.metrics.dueSoon} helper="avisos antecipados" />
        <Metric label="Fundadores" value={`${data.metrics.founderSlotsUsed}/3`} helper="posições vitalícias usadas" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Mensalidades e pagamentos</h2><p>Este é o financeiro da plataforma PedeAqui. Ele não mistura vendas, caixa ou contas dos restaurantes.</p></div></div>
        {data.canManage ? <details className={styles.details}>
          <summary>Criar ou atualizar uma mensalidade</summary>
          <form action={saveSubscriptionInvoiceAction} className={styles.detailsBody}>
            <label>Cliente<select className={styles.field} name="organizationId" required defaultValue=""><option value="" disabled>Selecione a empresa</option>{data.subscriptions.map((item) => <option value={item.organizationId} key={item.organizationId}>{item.organizationName}</option>)}</select></label>
            <label>Mês de referência<input className={styles.field} name="referenceMonth" type="month" required /></label>
            <label>Valor-base (R$)<input className={styles.field} name="baseAmount" type="number" min="0" max="1000000" step="0.01" defaultValue="79.90" required /></label>
            <label>Desconto desta mensalidade (R$)<input className={styles.field} name="discountAmount" type="number" min="0" max="1000000" step="0.01" defaultValue="0.00" required /></label>
            <label>Vencimento<input className={styles.field} name="dueAt" type="datetime-local" required /></label>
            <label>Situação<select className={styles.field} name="invoiceStatus" defaultValue="pending"><option value="pending">Pendente</option><option value="paid">Paga</option><option value="overdue">Em atraso</option><option value="waived">Isenta</option><option value="cancelled">Cancelada</option></select></label>
            <input type="hidden" name="idempotencyKey" value={`platform-invoice:${randomUUID()}`} />
            <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: mensalidade de agosto" /></label>
            <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: FAT-2026-008" /></label>
            <PendingSubmitButton className={styles.button}>Salvar mensalidade</PendingSubmitButton>
          </form>
        </details> : null}
        <div className={styles.featureList}>
          {data.invoices.map((invoice) => <div className={styles.featureRow} key={invoice.id}>
            <span><strong>{invoice.organizationName} · {invoice.referenceMonth.slice(0, 7)}</strong><small>{money(invoice.totalAmountCents)} · vence {dateTime(invoice.dueAt)} · {invoice.protocol}</small></span>
            <span><strong>{invoice.statusLabel}</strong>{data.canManage ? <details className={styles.details}><summary>Registrar pagamento</summary><form action={recordSubscriptionPaymentAction} className={styles.detailsBody}>
              <input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="idempotencyKey" value={`platform-payment:${randomUUID()}`} />
              <label>Valor (R$)<input className={styles.field} name="amount" type="number" min="0.01" max="1000000" step="0.01" defaultValue={(invoice.totalAmountCents / 100).toFixed(2)} required /></label>
              <label>Forma<select className={styles.field} name="method" defaultValue="manual"><option value="manual">Manual</option><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="card">Cartão</option></select></label>
              <label>Situação<select className={styles.field} name="paymentRecordStatus" defaultValue="paid"><option value="paid">Pago</option><option value="pending">Pendente</option><option value="failed">Falhou</option><option value="refunded">Estornado</option><option value="cancelled">Cancelado</option></select></label>
              <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: Pix confirmado" /></label>
              <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: PG-2026-001" /></label>
              <PendingSubmitButton className={styles.button}>Registrar</PendingSubmitButton>
            </form></details> : null}</span>
          </div>)}
          {data.invoices.length === 0 ? <div className={styles.empty}>Nenhuma mensalidade emitida. O primeiro lançamento pode ser feito acima.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Descontos programados</h2><p>O desconto termina na data definida e nunca altera o preço oficial nem o contrato-base.</p></div></div>
        <div className={styles.featureList}>{data.adjustments.map((item) => <div className={styles.featureRow} key={item.id}>
          <span><strong>{item.organizationName}</strong><small>{item.percentage === null ? money(item.amountCents) : `${item.percentage}%`} · {dateTime(item.startsAt)} até {dateTime(item.endsAt)} · {item.cancelledAt ? "cancelado" : "programado"}</small></span>
          {!item.cancelledAt && data.canManage ? <form action={cancelSubscriptionAdjustmentAction}><input type="hidden" name="adjustmentId" value={item.id} /><input type="hidden" name="reason" value="Desconto encerrado pelo Painel do Proprietário" /><input type="hidden" name="protocol" value={`DESC-${item.id.slice(0, 8)}`} /><PendingSubmitButton className={styles.exit}>Encerrar</PendingSubmitButton></form> : null}
        </div>)}{data.adjustments.length === 0 ? <div className={styles.empty}>Nenhum desconto temporário programado.</div> : null}</div>
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
              <span className={styles.meta}>Referência: {plan.monthlyPriceCents === null ? "preço personalizado" : `${money(plan.monthlyPriceCents)} por mês`}</span>
              <div className={styles.featureList}>
                {plan.features.slice(0, 8).map((feature) => <div className={styles.featureRow} key={`${plan.id}:${feature.name}`}><span>{feature.name}</span><strong>{feature.limitLabel}</strong></div>)}
                {plan.features.length === 0 ? <div className={styles.empty}>Nenhum recurso comercial habilitado.</div> : null}
              </div>
            </article>
          ))}
        </div>
        {data.canManage ? <details className={styles.details}>
          <summary>Criar um novo plano</summary>
          <PlanEditor features={data.features} />
        </details> : null}
        {data.canManage ? data.plans.map((plan) => <details className={styles.details} key={`edit:${plan.id}`}>
          <summary>Editar e versionar: {plan.name}</summary>
          <PlanEditor plan={plan} features={data.features} enabledFeatureIds={data.planFeatures.filter((item) => item.plan_id === plan.id && item.enabled).map((item) => item.feature_id)} />
        </details>) : null}
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
                <p className={styles.meta}><strong>{money(subscription.agreedPriceCents)}</strong>{subscription.priceLocked ? " · valor vitalício bloqueado" : " · sujeito aos termos do plano"}</p>
                <p className={styles.meta}>Vencimento: {subscription.billingDueDay ? `dia ${subscription.billingDueDay}` : "dia não definido"} · {subscription.paymentStatusLabel}</p>
                {subscription.nextDueAt ? <p className={styles.meta}>Próximo vencimento: {dateTime(subscription.nextDueAt)}</p> : null}
                {subscription.trialEndsAt ? <p className={styles.meta}>Teste até: {dateTime(subscription.trialEndsAt)}</p> : null}
                {subscription.graceEndsAt ? <p className={styles.meta}>Tolerância até: {dateTime(subscription.graceEndsAt)}</p> : null}
                {subscription.cancelAtPeriodEnd ? <p className={styles.advancedNote}>Cancelamento já agendado para o fim do período.</p> : null}
                <p className={styles.meta}>Cobrança externa: {subscription.hasProvider ? "provider conectado" : "gestão manual/sem provider"}</p>
                {subscription.founderSlot ? <p className={styles.advancedNote}>Cliente Fundador #{subscription.founderSlot} · R$ 79,90 preservados no contrato.</p> : null}
                {subscription.accessSuspendedAt ? <p className={styles.advancedNote}>Acesso suspenso desde {dateTime(subscription.accessSuspendedAt)}. Os dados do restaurante continuam preservados.</p> : null}

                {data.canManage ? <details className={styles.details}>
                  <summary>Fundadores e acesso do cliente</summary>
                  <div className={styles.detailsBody}>
                    {!subscription.founderSlot && data.metrics.founderSlotsUsed < 3 ? <form action={assignFounderPlanAction} className={styles.detailsBody}>
                      <input type="hidden" name="organizationId" value={subscription.organizationId} />
                      <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required defaultValue="Um dos três primeiros clientes do PedeAqui" /></label>
                      <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: FUNDADOR-001" /></label>
                      <p className={styles.advancedNote}>A atribuição usa uma trava no banco e recusa automaticamente o quarto cliente.</p>
                      <PendingSubmitButton className={styles.button}>Atribuir Plano Fundadores</PendingSubmitButton>
                    </form> : null}
                    <form action={setSubscriptionAccessAction} className={styles.detailsBody}>
                      <input type="hidden" name="organizationId" value={subscription.organizationId} />
                      <input type="hidden" name="suspended" value={subscription.accessSuspendedAt ? "false" : "true"} />
                      <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder={subscription.accessSuspendedAt ? "Pagamento regularizado" : "Prazo de tolerância encerrado"} /></label>
                      <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: ACESSO-2026-001" /></label>
                      <p className={styles.advancedNote}>Esta ação nunca apaga cardápio, pedidos ou configurações.</p>
                      <PendingSubmitButton className={styles.button}>{subscription.accessSuspendedAt ? "Reativar acesso" : "Suspender acesso"}</PendingSubmitButton>
                    </form>
                  </div>
                </details> : null}

                {data.canManage ? <details className={styles.details}>
                  <summary>Aplicar desconto temporário</summary>
                  <form action={applySubscriptionAdjustmentAction} className={styles.detailsBody}>
                    <input type="hidden" name="organizationId" value={subscription.organizationId} />
                    <label>Tipo<select className={styles.field} name="kind" defaultValue="discount_amount"><option value="discount_amount">Desconto em reais</option><option value="discount_percent">Desconto percentual</option><option value="credit">Crédito</option></select></label>
                    <label>Valor (R$)<input className={styles.field} name="amount" type="number" min="0.01" max="1000000" step="0.01" defaultValue="10.00" /></label>
                    <label>Percentual<input className={styles.field} name="percentage" type="number" min="0.01" max="100" step="0.01" defaultValue="10" /></label>
                    <label>Início<input className={styles.field} name="startsAt" type="datetime-local" required /></label>
                    <label>Fim automático<input className={styles.field} name="endsAt" type="datetime-local" required /></label>
                    <label>Motivo<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: condição de lançamento por dois meses" /></label>
                    <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: DESC-2026-001" /></label>
                    <p className={styles.advancedNote}>Ao final, o contrato-base volta a valer automaticamente.</p>
                    <PendingSubmitButton className={styles.button}>Programar desconto</PendingSubmitButton>
                  </form>
                </details> : null}

                {data.canManage ? (
                  <details className={styles.details}>
                    <summary>Mensalidade, vencimento e pagamento</summary>
                    <form action={updateCommercialTermsAction} className={styles.detailsBody}>
                      <Common organizationId={subscription.organizationId} />
                      <label>Valor acordado (R$)<input className={styles.field} name="agreedPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={subscription.agreedPriceCents === null ? "79.90" : (subscription.agreedPriceCents / 100).toFixed(2)} required /></label>
                      <label>Dia do vencimento<input className={styles.field} name="billingDueDay" type="number" min="1" max="28" defaultValue={subscription.billingDueDay ?? 10} /></label>
                      <label>Próximo vencimento<input className={styles.field} name="nextDueAt" type="datetime-local" /></label>
                      <label>Situação do pagamento<select className={styles.field} name="paymentStatus" defaultValue={subscription.paymentStatus}><option value="not_started">Cobrança não iniciada</option><option value="pending">Pendente</option><option value="paid">Pago</option><option value="overdue">Em atraso</option><option value="waived">Isento neste vencimento</option></select></label>
                      <label><input name="priceLocked" type="checkbox" defaultChecked={subscription.priceLocked} /> Manter este valor para sempre</label>
                      <label>Motivo do valor vitalício<input className={styles.field} name="priceLockReason" minLength={5} maxLength={500} defaultValue={subscription.priceLockReason ?? "Cliente fundador do PedeAqui"} placeholder="Ex.: um dos três primeiros clientes" /></label>
                      <p className={styles.advancedNote}>Com o valor vitalício marcado, reajustes futuros do plano não alteram esta mensalidade. Uma mudança posterior exige nova ação, motivo e protocolo.</p>
                      <PendingSubmitButton className={styles.button} pendingLabel="Salvando termos…">Salvar termos comerciais</PendingSubmitButton>
                    </form>
                  </details>
                ) : null}

                {data.canManage && ["trialing", "active", "past_due"].includes(subscription.status) ? (
                  <details className={styles.details}>
                    <summary>Alterar plano mantendo o ciclo atual</summary>
                    <form action={changePlanAction} className={styles.detailsBody}>
                      <Common organizationId={subscription.organizationId} />
                      <PlanFields plans={activePlans} selectedPlanId={subscription.planId} selectedInterval={subscription.billingInterval} />
                      <PendingSubmitButton className={styles.button}>Aplicar mudança de plano</PendingSubmitButton>
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
                      <PendingSubmitButton className={styles.button}>Estender teste</PendingSubmitButton>
                    </form>
                  </details>
                ) : null}

                {data.canManage && ["trialing", "past_due"].includes(subscription.status) ? (
                  <details className={styles.details}>
                    <summary>Ativar assinatura</summary>
                    <form action={activateSubscriptionAction} className={styles.detailsBody}>
                      <Common organizationId={subscription.organizationId} />
                      <PlanFields plans={activePlans} selectedPlanId={subscription.planId} selectedInterval={subscription.billingInterval} />
                      <PendingSubmitButton className={styles.button}>Ativar pelo fluxo oficial</PendingSubmitButton>
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
                        <PendingSubmitButton className={styles.button}>Aplicar tolerância</PendingSubmitButton>
                      </form>
                    </details>
                    {!subscription.cancelAtPeriodEnd ? <details className={styles.details}>
                      <summary>Agendar cancelamento no fim do período</summary>
                      <form action={scheduleCancellationAction} className={styles.detailsBody}>
                        <Common organizationId={subscription.organizationId} />
                        <p className={styles.advancedNote}>A assinatura continua válida até o fim do período atual. Nenhum encerramento imediato é feito por esta ação.</p>
                        <PendingSubmitButton className={styles.button}>Agendar cancelamento</PendingSubmitButton>
                      </form>
                    </details> : null}
                    <details className={styles.details}>
                      <summary>Cancelar imediatamente</summary>
                      <form action={cancelSubscriptionNowAction} className={styles.detailsBody}>
                        <Common organizationId={subscription.organizationId} />
                        <label>Confirmação<input className={styles.field} name="cancelConfirmation" value="CANCELAR" readOnly /></label>
                        <p className={styles.advancedNote}>Use apenas quando a decisão comercial já estiver confirmada. A ação passa pela state machine e fica registrada no histórico.</p>
                        <PendingSubmitButton className={styles.button} pendingLabel="Cancelando…">Cancelar assinatura</PendingSubmitButton>
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
                <PendingSubmitButton className={styles.button}>Iniciar teste</PendingSubmitButton>
              </form>
              <form action={activateSubscriptionAction} className={styles.detailsBody}>
                <strong>Ativar diretamente</strong>
                <NewSubscriptionCommon organizations={data.organizations} />
                <PlanFields plans={activePlans} />
                <PendingSubmitButton className={styles.button}>Ativar assinatura</PendingSubmitButton>
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

function Metric({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>;
}

function PlanEditor({ plan, features, enabledFeatureIds = [] }: {
  plan?: { id: string; key: string; name: string; description: string | null; monthlyPriceCents: number | null; yearlyPriceCents: number | null; active: boolean; position: number };
  features: Array<{ id: string; name: string; active: boolean }>;
  enabledFeatureIds?: string[];
}) {
  const enabled = new Set(enabledFeatureIds);
  return <form action={saveCommercialPlanAction} className={styles.detailsBody}>
    {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
    <label>Identificador amigável<input className={styles.field} name="key" pattern="[a-z0-9][a-z0-9._-]{1,79}" defaultValue={plan?.key ?? ""} placeholder="ex.: delivery-basico" required /></label>
    <label>Nome<input className={styles.field} name="name" minLength={2} maxLength={120} defaultValue={plan?.name ?? ""} required /></label>
    <label>Descrição<textarea className={styles.field} name="description" maxLength={1000} defaultValue={plan?.description ?? ""} /></label>
    <label>Mensal (R$)<input className={styles.field} name="monthlyPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={plan?.monthlyPriceCents === null || plan?.monthlyPriceCents === undefined ? "" : (plan.monthlyPriceCents / 100).toFixed(2)} /></label>
    <label>Anual (R$)<input className={styles.field} name="yearlyPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={plan?.yearlyPriceCents === null || plan?.yearlyPriceCents === undefined ? "" : (plan.yearlyPriceCents / 100).toFixed(2)} /></label>
    <label>Ordem<input className={styles.field} name="position" type="number" min="0" max="10000" defaultValue={plan?.position ?? 100} required /></label>
    <label><input name="active" type="checkbox" defaultChecked={plan?.active ?? true} /> Disponível para novas vendas</label>
    <fieldset className={styles.detailsBody}><legend>Módulos incluídos no plano</legend>{features.filter((feature) => feature.active).map((feature) => <label key={feature.id}><input type="checkbox" name="featureIds" value={feature.id} defaultChecked={enabled.has(feature.id)} /> {feature.name}</label>)}</fieldset>
    <label>Motivo da nova versão<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: novo preço e módulos aprovados" /></label>
    <label>Protocolo<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: PLANO-2026-001" /></label>
    <p className={styles.advancedNote}>Ao salvar, o PedeAqui cria uma nova versão. Assinaturas antigas continuam presas à versão contratada.</p>
    <PendingSubmitButton className={styles.button}>Salvar nova versão</PendingSubmitButton>
  </form>;
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
