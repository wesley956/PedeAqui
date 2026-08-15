import { notFound } from "next/navigation";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { platformSubscriptionAction, platformPlanAction, platformPlanFeatureAction, platformIntegrationCatalogAction } from "@/features/platform-admin/actions";
import { OrganizationSearch, type PlatformOrganizationCard } from "./organization-search";
import styles from "./platform.module.css";

const subscriptionLabels: Record<string, string> = {
  trialing: "Em teste", active: "Ativo", past_due: "Pagamento pendente", cancelled: "Cancelado", expired: "Expirado",
};
const organizationLabels: Record<string, string> = { active: "Ativa", inactive: "Inativa", suspended: "Suspensa" };
const integrationLabels: Record<string, string> = { payment: "Pagamentos", whatsapp: "WhatsApp", marketplace: "Marketplace", fiscal: "Fiscal", delivery: "Entrega", generic: "Integração", billing: "Cobrança PedeAqui" };
const successfulBilling = new Set(["processed", "completed", "success", "succeeded"]);
const failedBilling = new Set(["failed", "error", "rejected"]);
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function subscriptionTone(status: string | undefined): PlatformOrganizationCard["tone"] {
  if (status === "active") return "good";
  if (status === "trialing") return "warn";
  if (status === "past_due" || status === "expired") return "danger";
  return "neutral";
}

export default async function PlatformPage() {
  let data: Awaited<ReturnType<typeof PlatformAdminService.load>>;
  try {
    data = await PlatformAdminService.load();
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) notFound();
    throw error;
  }

  const subscriptionByOrg = new Map(data.subscriptions.map((item) => [item.organization_id, item]));
  const planById = new Map(data.plans.map((plan) => [plan.id, plan]));
  const featureById = new Map(data.features.map((feature) => [feature.id, feature]));
  const canManage = data.role === "super_admin";
  const activeSubscriptions = data.subscriptions.filter((item) => item.status === "active").length;
  const trials = data.subscriptions.filter((item) => item.status === "trialing").length;
  const billingAttention = data.subscriptions.filter((item) => item.status === "past_due").length;
  const activeIntegrations = data.catalog.filter((item) => item.active).length;
  const billingFailures = data.webhooks.filter((item) => failedBilling.has(item.status)).length;
  const billingSuccess = data.webhooks.filter((item) => successfulBilling.has(item.status)).length;
  const billingPending = data.webhooks.length - billingFailures - billingSuccess;

  const organizations: PlatformOrganizationCard[] = data.organizations.map((org) => {
    const subscription = subscriptionByOrg.get(org.id);
    const plan = subscription ? planById.get(subscription.plan_id) : null;
    return {
      id: org.id,
      name: org.name,
      organizationStatus: organizationLabels[org.status] ?? "Cadastrada",
      subscriptionStatus: subscription?.status ?? "none",
      subscriptionLabel: subscription ? (subscriptionLabels[subscription.status] ?? "Em análise") : "Sem assinatura",
      planName: plan?.name ?? "Sem plano",
      createdLabel: date.format(new Date(org.created_at)),
      tone: subscriptionTone(subscription?.status),
    };
  });

  return (
    <div className={styles.page}>
      <header className={styles.hero} id="visao-geral">
        <div><p className={styles.eyebrow}>PEDEAQUI · PLATAFORMA</p><h1>Painel do Proprietário</h1><p>Acompanhe empresas, assinaturas, integrações e a saúde comercial da plataforma. Os dados operacionais detalhados de cada restaurante entram na próxima camada de suporte 360°.</p></div>
        <span className={styles.roleBadge}>{canManage ? "Acesso total" : "Acesso de suporte"}</span>
      </header>

      <section className={styles.metrics} aria-label="Resumo da plataforma">
        <Metric label="Empresas" value={data.organizations.length} helper="cadastradas" />
        <Metric label="Clientes ativos" value={activeSubscriptions} helper="assinaturas ativas" />
        <Metric label="Em teste" value={trials} helper="períodos de avaliação" />
        <Metric label="Atenção cobrança" value={billingAttention} helper="clientes com pendência" />
        <Metric label="Integrações" value={activeIntegrations} helper="disponíveis na plataforma" />
      </section>

      <section className={styles.section} id="empresas">
        <div className={styles.sectionHeader}><div><h2>Empresas</h2><p>Encontre rapidamente um cliente e veja sua situação comercial. A visão operacional completa será adicionada pela [338].</p></div></div>
        <OrganizationSearch organizations={organizations} />
        {canManage ? <details className={styles.details}><summary>Ajustar assinatura de uma empresa</summary><form action={platformSubscriptionAction} className={styles.detailsBody}><div className={styles.formGrid}>
          <select className={styles.field} name="organizationId" required defaultValue=""><option value="" disabled>Empresa</option>{data.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
          <select className={styles.field} name="planKey" required defaultValue=""><option value="" disabled>Plano</option>{data.plans.filter((item) => item.active).map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}</select>
          <select className={styles.field} name="status" defaultValue="active"><option value="trialing">Em teste</option><option value="active">Ativa</option><option value="past_due">Pagamento pendente</option><option value="cancelled">Cancelada</option><option value="expired">Expirada</option></select>
          <select className={styles.field} name="billingInterval" defaultValue="month"><option value="month">Mensal</option><option value="year">Anual</option><option value="manual">Manual</option></select>
          <input className={styles.field} name="periodEnd" type="datetime-local" aria-label="Fim do período" /><input className={styles.field} name="trialEndsAt" type="datetime-local" aria-label="Fim do teste" /><input className={styles.field} name="graceEndsAt" type="datetime-local" aria-label="Fim da tolerância" />
        </div><label className={styles.meta}><input type="checkbox" name="cancelAtPeriodEnd" /> Cancelar ao final do período atual</label><div><button className={styles.button}>Aplicar alteração</button></div></form></details> : null}
      </section>

      <section className={styles.section} id="planos">
        <div className={styles.sectionHeader}><div><h2>Planos e recursos</h2><p>Veja o que cada plano oferece. Configurações técnicas ficam recolhidas e restritas ao proprietário.</p></div></div>
        <div className={styles.planGrid}>{data.plans.map((plan) => {
          const features = data.planFeatures.filter((row) => row.plan_id === plan.id && row.enabled);
          return <article key={plan.id} className={styles.planCard}><div className={styles.cardTop}><strong>{plan.name}</strong><span className={styles.pill} data-tone={plan.active ? "good" : "neutral"}>{plan.active ? "Disponível" : "Fora de venda"}</span></div>{plan.description ? <span className={styles.meta}>{plan.description}</span> : null}<span className={styles.meta}>{features.length} recurso(s) habilitado(s)</span><div className={styles.featureList}>{features.slice(0, 6).map((row) => <div key={row.feature_id} className={styles.featureRow}><span>{featureById.get(row.feature_id)?.name ?? "Recurso"}</span><strong>{row.limit_value === null ? "Incluído" : `Até ${row.limit_value}`}</strong></div>)}</div></article>;
        })}</div>
        {canManage ? <details className={styles.details}><summary>Administração avançada de planos</summary><div className={styles.detailsBody}><form action={platformPlanAction} className={styles.formGrid}><input className={styles.field} name="key" placeholder="Identificador interno" required /><input className={styles.field} name="name" placeholder="Nome do plano" required /><input className={styles.field} name="description" placeholder="Descrição" /><input className={styles.field} name="position" type="number" defaultValue="40" /><label className={styles.meta}><input type="checkbox" name="active" defaultChecked /> Disponível</label><button className={styles.button}>Salvar plano</button></form><form action={platformPlanFeatureAction} className={styles.formGrid}><select className={styles.field} name="planId">{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><select className={styles.field} name="featureId">{data.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select><input className={styles.field} name="limitValue" type="number" min="0" placeholder="Sem limite" /><label className={styles.meta}><input name="enabled" type="checkbox" defaultChecked /> Recurso habilitado</label><button className={styles.button}>Aplicar recurso</button></form></div></details> : null}
      </section>

      <section className={styles.section} id="integracoes">
        <div className={styles.sectionHeader}><div><h2>Integrações disponíveis</h2><p>Catálogo central da plataforma. A saúde de cada restaurante será detalhada na Central de Integrações [340].</p></div></div>
        <div className={styles.integrationGrid}>{data.catalog.map((item) => <article key={item.id} className={styles.integrationCard}><div className={styles.cardTop}><strong>{item.display_name}</strong><span className={styles.pill} data-tone={item.active ? "good" : "neutral"}>{item.active ? "Disponível" : "Desativada"}</span></div><span className={styles.meta}>{integrationLabels[item.kind] ?? "Integração"}</span>{item.description ? <span className={styles.meta}>{item.description}</span> : null}</article>)}</div>
        {canManage ? <details className={styles.details}><summary>Configuração avançada do catálogo</summary><form action={platformIntegrationCatalogAction} className={styles.detailsBody}><p className={styles.advancedNote}>Esta área altera o catálogo técnico da plataforma e não é exibida aos restaurantes.</p><div className={styles.formGrid}><input className={styles.field} name="adapterKey" placeholder="Identificador técnico" required /><select className={styles.field} name="kind"><option value="payment">Pagamentos</option><option value="whatsapp">WhatsApp</option><option value="marketplace">Marketplace</option><option value="fiscal">Fiscal</option><option value="delivery">Entrega</option><option value="generic">Genérica</option><option value="billing">Cobrança PedeAqui</option></select><input className={styles.field} name="displayName" placeholder="Nome exibido" required /><input className={styles.field} name="description" placeholder="Descrição" /><input className={styles.field} name="position" type="number" defaultValue="0" /><label className={styles.meta}><input type="checkbox" name="active" defaultChecked /> Disponível</label></div><div><button className={styles.button}>Salvar integração</button></div></form></details> : null}
      </section>

      <section className={styles.section} id="saude">
        <div className={styles.sectionHeader}><div><h2>Saúde da cobrança PedeAqui</h2><p>Resumo dos eventos recentes de cobrança da própria plataforma, sem exibir credenciais ou conteúdo sensível.</p></div></div>
        <div className={styles.healthSummary}><div className={styles.healthCard}><strong>{billingSuccess}</strong><span>processados com sucesso</span></div><div className={styles.healthCard}><strong>{billingPending}</strong><span>em processamento ou revisão</span></div><div className={styles.healthCard}><strong>{billingFailures}</strong><span>precisam de atenção</span></div></div>
        <div className={styles.healthList}>{data.webhooks.slice(0, 12).map((item) => <div key={item.id} className={styles.healthRow}><span>{date.format(new Date(item.created_at))}</span><strong>{failedBilling.has(item.status) ? "Precisa de atenção" : successfulBilling.has(item.status) ? "Processado" : "Em processamento"}</strong></div>)}{data.webhooks.length === 0 ? <div className={styles.empty}>Nenhum evento de cobrança registrado ainda.</div> : null}</div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>; }
