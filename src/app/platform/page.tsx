import { notFound } from "next/navigation";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { PlatformOwnerOverviewService } from "@/server/platform/platform-owner-overview-service";
import { platformSubscriptionAction, platformPlanAction, platformPlanFeatureAction, platformIntegrationCatalogAction } from "@/features/platform-admin/actions";
import { OrganizationSearch, type PlatformOrganizationCard, type PlatformUnitCard } from "./organization-search";
import styles from "./platform.module.css";

const subscriptionLabels: Record<string, string> = {
  trialing: "Em teste", active: "Ativo", past_due: "Pagamento pendente", cancelled: "Cancelado", expired: "Expirado",
};
const organizationLabels: Record<string, string> = { active: "Ativa", trial: "Em teste", suspended: "Suspensa", cancelled: "Cancelada" };
const storeLabels: Record<string, string> = { active: "Ativa", inactive: "Inativa", temporarily_closed: "Fechada temporariamente" };
const orderStatusLabels: Record<string, string> = { pending_confirmation: "Aguardando confirmação", confirmed: "Confirmados", rejected: "Rejeitados", canceled: "Cancelados", completed: "Concluídos" };
const integrationLabels: Record<string, string> = { payment: "Pagamentos", whatsapp: "WhatsApp", marketplace: "Marketplace", fiscal: "Fiscal", delivery: "Entrega", generic: "Integração", billing: "Cobrança PedeAqui" };
const successfulBilling = new Set(["processed", "completed", "success", "succeeded"]);
const failedBilling = new Set(["failed", "error", "rejected"]);
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function subscriptionTone(status: string | undefined): PlatformOrganizationCard["tone"] {
  if (status === "active") return "good";
  if (status === "trialing") return "warn";
  if (status === "past_due" || status === "expired") return "danger";
  return "neutral";
}

function unitTone(status: string): PlatformUnitCard["tone"] {
  if (status === "active") return "good";
  if (status === "temporarily_closed") return "warn";
  return "neutral";
}

export default async function PlatformPage() {
  let data: Awaited<ReturnType<typeof PlatformAdminService.load>>;
  let overview: Awaited<ReturnType<typeof PlatformOwnerOverviewService.load>>;
  try {
    [data, overview] = await Promise.all([PlatformAdminService.load(), PlatformOwnerOverviewService.load()]);
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) notFound();
    throw error;
  }

  const subscriptionByOrg = new Map(data.subscriptions.map((item) => [item.organization_id, item]));
  const planById = new Map(data.plans.map((plan) => [plan.id, plan]));
  const featureById = new Map(data.features.map((feature) => [feature.id, feature]));
  const organizationById = new Map(data.organizations.map((organization) => [organization.id, organization]));
  const canManage = data.role === "super_admin";
  const activeSubscriptions = data.subscriptions.filter((item) => item.status === "active").length;
  const trials = data.subscriptions.filter((item) => item.status === "trialing").length;
  const billingAttention = data.subscriptions.filter((item) => item.status === "past_due").length;
  const activeIntegrations = data.catalog.filter((item) => item.active).length;
  const billingFailures = data.webhooks.filter((item) => failedBilling.has(item.status)).length;
  const billingSuccess = data.webhooks.filter((item) => successfulBilling.has(item.status)).length;
  const billingPending = data.webhooks.length - billingFailures - billingSuccess;
  const incidentCount = billingAttention + billingFailures + overview.integrationAlerts;
  const healthLabel = incidentCount === 0 ? "Saudável" : "Atenção necessária";

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

  const units: PlatformUnitCard[] = overview.units.map((unit) => ({
    id: unit.id,
    name: unit.name,
    organizationName: organizationById.get(unit.organizationId)?.name ?? "Empresa",
    statusLabel: storeLabels[unit.status] ?? "Cadastrada",
    locationLabel: [unit.city, unit.state].filter(Boolean).join(" / ") || "Localização não informada",
    recentOrders: unit.recentOrders,
    lastOrderLabel: unit.lastOrderAt ? `último pedido em ${dateTime.format(new Date(unit.lastOrderAt))}` : "sem pedido recente",
    tone: unitTone(unit.status),
  }));

  const activeUnitRows = overview.units
    .filter((unit) => unit.recentOrders > 0)
    .sort((a, b) => b.recentOrders - a.recentOrders || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 8);

  return (
    <div className={styles.page}>
      <header className={styles.hero} id="visao-geral">
        <div><p className={styles.eyebrow}>PEDEAQUI · PLATAFORMA</p><h1>Painel do Proprietário</h1><p>Acompanhe empresas, unidades, assinaturas, integrações e a saúde geral do PedeAqui em uma central separada da operação dos restaurantes.</p></div>
        <span className={styles.roleBadge}>{canManage ? "Acesso total" : "Acesso de suporte"}</span>
      </header>

      <section className={styles.metrics} aria-label="Resumo da plataforma">
        <Metric label="Unidades ativas" value={overview.activeUnits} helper={`de ${overview.totalUnits} cadastradas`} />
        <Metric label="Pedidos 24h" value={overview.ordersLast24h} helper={`${overview.openOrders} em andamento agora`} />
        <Metric label="Clientes ativos" value={activeSubscriptions} helper="assinaturas ativas" />
        <Metric label="Em teste" value={trials} helper="períodos de avaliação" />
        <Metric label="Alertas" value={incidentCount} helper={healthLabel} />
      </section>

      <section className={styles.section} id="empresas">
        <div className={styles.sectionHeader}><div><h2>Empresas e unidades</h2><p>Busque uma empresa, unidade ou plano sem entrar na área operacional do restaurante.</p></div></div>
        <OrganizationSearch organizations={organizations} units={units} />
      </section>

      <section className={styles.section} id="operacao">
        <div className={styles.sectionHeader}><div><h2>Operação da plataforma</h2><p>Indicadores agregados das últimas 24 horas. Nenhum nome, telefone, endereço ou detalhe de cliente é carregado nesta visão.</p></div><span className={styles.pill} data-tone={incidentCount === 0 ? "good" : "warn"}>{healthLabel}</span></div>
        <div className={styles.healthSummary}>
          <div className={styles.healthCard}><strong>{overview.ordersLast24h}</strong><span>pedidos criados nas últimas 24h</span></div>
          <div className={styles.healthCard}><strong>{overview.openOrders}</strong><span>pedidos ainda em andamento</span></div>
          <div className={styles.healthCard}><strong>{overview.lastOrderAt ? dateTime.format(new Date(overview.lastOrderAt)) : "—"}</strong><span>última atividade de pedido registrada</span></div>
        </div>
        <div className={styles.operationGrid}>
          <div className={styles.operationPanel}><strong>Situação dos pedidos recentes</strong><div className={styles.featureList}>{overview.recentOrderStatus.map((item) => <div key={item.status} className={styles.featureRow}><span>{orderStatusLabels[item.status] ?? "Outros"}</span><strong>{item.count}</strong></div>)}{overview.recentOrderStatus.length === 0 ? <div className={styles.empty}>Sem pedidos recentes.</div> : null}</div></div>
          <div className={styles.operationPanel}><strong>Unidades com atividade recente</strong><div className={styles.featureList}>{activeUnitRows.map((unit) => <div key={unit.id} className={styles.featureRow}><span>{unit.name}<small>{organizationById.get(unit.organizationId)?.name ?? "Empresa"}</small></span><strong>{unit.recentOrders}</strong></div>)}{activeUnitRows.length === 0 ? <div className={styles.empty}>Nenhuma atividade recente detectada.</div> : null}</div></div>
        </div>
      </section>

      <section className={styles.section} id="integracoes">
        <div className={styles.sectionHeader}><div><h2>Integrações disponíveis</h2><p>Catálogo central e sinais de entrega das integrações da plataforma.</p></div><span className={styles.pill} data-tone={overview.integrationAlerts > 0 ? "danger" : "good"}>{overview.integrationAlerts > 0 ? `${overview.integrationAlerts} falha(s) definitiva(s)` : "Sem falhas definitivas"}</span></div>
        <div className={styles.integrationGrid}>{data.catalog.map((item) => <article key={item.id} className={styles.integrationCard}><div className={styles.cardTop}><strong>{item.display_name}</strong><span className={styles.pill} data-tone={item.active ? "good" : "neutral"}>{item.active ? "Disponível" : "Desativada"}</span></div><span className={styles.meta}>{integrationLabels[item.kind] ?? "Integração"}</span>{item.description ? <span className={styles.meta}>{item.description}</span> : null}</article>)}</div>
        {canManage ? <details className={styles.details}><summary>Configuração avançada do catálogo</summary><form action={platformIntegrationCatalogAction} className={styles.detailsBody}><p className={styles.advancedNote}>Esta área altera o catálogo técnico da plataforma e não é exibida aos restaurantes.</p><div className={styles.formGrid}><input className={styles.field} name="adapterKey" placeholder="Identificador técnico" required /><select className={styles.field} name="kind"><option value="payment">Pagamentos</option><option value="whatsapp">WhatsApp</option><option value="marketplace">Marketplace</option><option value="fiscal">Fiscal</option><option value="delivery">Entrega</option><option value="generic">Genérica</option><option value="billing">Cobrança PedeAqui</option></select><input className={styles.field} name="displayName" placeholder="Nome exibido" required /><input className={styles.field} name="description" placeholder="Descrição" /><input className={styles.field} name="position" type="number" defaultValue="0" /><label className={styles.meta}><input type="checkbox" name="active" defaultChecked /> Disponível</label></div><div><button className={styles.button}>Salvar integração</button></div></form></details> : null}
      </section>

      <section className={styles.section} id="assinaturas">
        <div className={styles.sectionHeader}><div><h2>Assinaturas e planos</h2><p>Acompanhe a situação comercial e administre planos sem expor chaves internas na tela principal.</p></div></div>
        <div className={styles.healthSummary}><div className={styles.healthCard}><strong>{activeSubscriptions}</strong><span>assinaturas ativas</span></div><div className={styles.healthCard}><strong>{trials}</strong><span>clientes em teste</span></div><div className={styles.healthCard}><strong>{billingAttention}</strong><span>pagamentos que pedem atenção</span></div></div>
        <div className={styles.planGrid}>{data.plans.map((plan) => {
          const features = data.planFeatures.filter((row) => row.plan_id === plan.id && row.enabled);
          return <article key={plan.id} className={styles.planCard}><div className={styles.cardTop}><strong>{plan.name}</strong><span className={styles.pill} data-tone={plan.active ? "good" : "neutral"}>{plan.active ? "Disponível" : "Fora de venda"}</span></div>{plan.description ? <span className={styles.meta}>{plan.description}</span> : null}<span className={styles.meta}>{features.length} recurso(s) habilitado(s)</span><div className={styles.featureList}>{features.slice(0, 6).map((row) => <div key={row.feature_id} className={styles.featureRow}><span>{featureById.get(row.feature_id)?.name ?? "Recurso"}</span><strong>{row.limit_value === null ? "Incluído" : `Até ${row.limit_value}`}</strong></div>)}</div></article>;
        })}</div>
        {canManage ? <details className={styles.details}><summary>Ajustar assinatura de uma empresa</summary><form action={platformSubscriptionAction} className={styles.detailsBody}><div className={styles.formGrid}>
          <select className={styles.field} name="organizationId" required defaultValue=""><option value="" disabled>Empresa</option>{data.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
          <select className={styles.field} name="planKey" required defaultValue=""><option value="" disabled>Plano</option>{data.plans.filter((item) => item.active).map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}</select>
          <select className={styles.field} name="status" defaultValue="active"><option value="trialing">Em teste</option><option value="active">Ativa</option><option value="past_due">Pagamento pendente</option><option value="cancelled">Cancelada</option><option value="expired">Expirada</option></select>
          <select className={styles.field} name="billingInterval" defaultValue="month"><option value="month">Mensal</option><option value="year">Anual</option><option value="manual">Manual</option></select>
          <input className={styles.field} name="periodEnd" type="datetime-local" aria-label="Fim do período" /><input className={styles.field} name="trialEndsAt" type="datetime-local" aria-label="Fim do teste" /><input className={styles.field} name="graceEndsAt" type="datetime-local" aria-label="Fim da tolerância" />
        </div><label className={styles.meta}><input type="checkbox" name="cancelAtPeriodEnd" /> Cancelar ao final do período atual</label><div><button className={styles.button}>Aplicar alteração</button></div></form></details> : null}
        {canManage ? <details className={styles.details}><summary>Administração avançada de planos</summary><div className={styles.detailsBody}><form action={platformPlanAction} className={styles.formGrid}><input className={styles.field} name="key" placeholder="Identificador interno" required /><input className={styles.field} name="name" placeholder="Nome do plano" required /><input className={styles.field} name="description" placeholder="Descrição" /><input className={styles.field} name="position" type="number" defaultValue="40" /><label className={styles.meta}><input type="checkbox" name="active" defaultChecked /> Disponível</label><button className={styles.button}>Salvar plano</button></form><form action={platformPlanFeatureAction} className={styles.formGrid}><select className={styles.field} name="planId">{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><select className={styles.field} name="featureId">{data.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select><input className={styles.field} name="limitValue" type="number" min="0" placeholder="Sem limite" /><label className={styles.meta}><input name="enabled" type="checkbox" defaultChecked /> Recurso habilitado</label><button className={styles.button}>Aplicar recurso</button></form></div></details> : null}
      </section>

      <section className={styles.section} id="incidentes">
        <div className={styles.sectionHeader}><div><h2>Incidentes e saúde</h2><p>Alertas comerciais e técnicos consolidados para direcionar o suporte sem abrir dados sensíveis de restaurantes.</p></div></div>
        <div className={styles.healthSummary}><div className={styles.healthCard}><strong>{billingFailures}</strong><span>falhas recentes na cobrança PedeAqui</span></div><div className={styles.healthCard}><strong>{overview.integrationAlerts}</strong><span>entregas de integração encerradas com falha</span></div><div className={styles.healthCard}><strong>{billingAttention}</strong><span>assinaturas com pagamento pendente</span></div></div>
        <div className={styles.healthList}>{data.webhooks.slice(0, 12).map((item) => <div key={item.id} className={styles.healthRow}><span>{date.format(new Date(item.created_at))}</span><strong>{failedBilling.has(item.status) ? "Precisa de atenção" : successfulBilling.has(item.status) ? "Processado" : "Em processamento"}</strong></div>)}{data.webhooks.length === 0 ? <div className={styles.empty}>Nenhum evento de cobrança registrado ainda.</div> : null}</div>
        <span className={styles.meta}>{billingSuccess} processado(s) com sucesso · {billingPending} em processamento ou revisão.</span>
      </section>

      <section className={styles.section} id="suporte">
        <div className={styles.sectionHeader}><div><h2>Suporte</h2><p>Fundação para diagnóstico por empresa e unidade, preservando a separação entre plataforma e operação.</p></div></div>
        <div className={styles.supportGrid}><SupportCard title="Busca global" text="Empresas e unidades podem ser localizadas pela mesma busca, com contexto comercial e operacional resumido." /><SupportCard title="Acesso controlado" text={canManage ? "Seu perfil pode administrar a plataforma. Ações críticas continuam passando pelos serviços controlados do PedeAqui." : "O perfil de suporte permanece em leitura e diagnóstico; alterações comerciais e críticas ficam bloqueadas."} /><SupportCard title="Sem dados de cliente" text="O resumo operacional não carrega nomes, telefones, endereços ou conteúdo de pedidos dos clientes dos restaurantes." /></div>
      </section>

      <section className={styles.section} id="configuracao">
        <div className={styles.sectionHeader}><div><h2>Configuração da plataforma</h2><p>Recursos avançados ficam concentrados nas áreas de Assinaturas e Integrações e aparecem somente para o proprietário.</p></div></div>
        <div className={styles.supportGrid}><SupportCard title="Planos" text={`${data.plans.length} plano(s) cadastrado(s) e ${data.planFeatures.filter((item) => item.enabled).length} vínculo(s) de recurso ativo(s).`} /><SupportCard title="Catálogo" text={`${activeIntegrations} integração(ões) disponível(is) para uso na plataforma.`} /><SupportCard title="Perfil atual" text={canManage ? "Proprietário: leitura, diagnóstico e administração autorizada." : "Suporte: leitura e diagnóstico, sem administração crítica."} /></div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>; }
function SupportCard({ title, text }: { title: string; text: string }) { return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>; }
