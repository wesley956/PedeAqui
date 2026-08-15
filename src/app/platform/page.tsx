import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { PlatformOwnerOverviewService } from "@/server/platform/platform-owner-overview-service";
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
      createdLabel: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(org.created_at)),
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
        <div className={styles.sectionHeader}><div><h2>Operação da plataforma</h2><p>Indicadores agregados das últimas 24 horas, sem carregar dados pessoais dos clientes dos restaurantes.</p></div><Link className={styles.button} href="/platform/operacao">Abrir Operação</Link></div>
        <div className={styles.healthSummary}>
          <div className={styles.healthCard}><strong>{overview.ordersLast24h}</strong><span>pedidos nas últimas 24h</span></div>
          <div className={styles.healthCard}><strong>{overview.openOrders}</strong><span>pedidos em andamento</span></div>
          <div className={styles.healthCard}><strong>{overview.lastOrderAt ? dateTime.format(new Date(overview.lastOrderAt)) : "—"}</strong><span>última atividade</span></div>
        </div>
        <div className={styles.operationGrid}>
          <div className={styles.operationPanel}><strong>Situação dos pedidos recentes</strong><div className={styles.featureList}>{overview.recentOrderStatus.map((item) => <div key={item.status} className={styles.featureRow}><span>{orderStatusLabels[item.status] ?? "Outros"}</span><strong>{item.count}</strong></div>)}{overview.recentOrderStatus.length === 0 ? <div className={styles.empty}>Sem pedidos recentes.</div> : null}</div></div>
          <div className={styles.operationPanel}><strong>Unidades com atividade recente</strong><div className={styles.featureList}>{activeUnitRows.map((unit) => <div key={unit.id} className={styles.featureRow}><span>{unit.name}<small>{organizationById.get(unit.organizationId)?.name ?? "Empresa"}</small></span><strong>{unit.recentOrders}</strong></div>)}{activeUnitRows.length === 0 ? <div className={styles.empty}>Nenhuma atividade recente detectada.</div> : null}</div></div>
        </div>
      </section>

      <section className={styles.section} id="integracoes">
        <div className={styles.sectionHeader}><div><h2>Integrações</h2><p>Estado geral das conexões e entregas externas da plataforma.</p></div><Link className={styles.button} href="/platform/integracoes">Abrir Integrações</Link></div>
        <div className={styles.integrationGrid}>{data.catalog.slice(0, 8).map((item) => <article key={item.id} className={styles.integrationCard}><div className={styles.cardTop}><strong>{item.display_name}</strong><span className={styles.pill} data-tone={item.active ? "good" : "neutral"}>{item.active ? "Disponível" : "Desativada"}</span></div><span className={styles.meta}>{integrationLabels[item.kind] ?? "Integração"}</span></article>)}</div>
      </section>

      <section className={styles.section} id="assinaturas">
        <div className={styles.sectionHeader}><div><h2>Assinaturas e planos</h2><p>A visão comercial agora possui jornada própria; estados internos e chaves técnicas não são editados nesta tela.</p></div><Link className={styles.button} href="/platform/assinaturas">Abrir Assinaturas</Link></div>
        <div className={styles.healthSummary}><div className={styles.healthCard}><strong>{activeSubscriptions}</strong><span>assinaturas ativas</span></div><div className={styles.healthCard}><strong>{trials}</strong><span>clientes em teste</span></div><div className={styles.healthCard}><strong>{billingAttention}</strong><span>cobranças pedindo atenção</span></div></div>
      </section>

      <section className={styles.section} id="incidentes">
        <div className={styles.sectionHeader}><div><h2>Incidentes e saúde</h2><p>Sinais agregados para direcionar a investigação sem abrir payloads sensíveis.</p></div></div>
        <div className={styles.healthSummary}><div className={styles.healthCard}><strong>{billingFailures}</strong><span>falhas recentes na cobrança PedeAqui</span></div><div className={styles.healthCard}><strong>{overview.integrationAlerts}</strong><span>falhas definitivas de integração</span></div><div className={styles.healthCard}><strong>{billingAttention}</strong><span>assinaturas com atenção financeira</span></div></div>
        <span className={styles.meta}>{billingSuccess} evento(s) de billing processado(s) · {billingPending} em processamento ou revisão.</span>
      </section>

      <section className={styles.section} id="suporte">
        <div className={styles.sectionHeader}><div><h2>Suporte</h2><p>Diagnóstico de contas e acessos com separação entre leitura de suporte e intervenções elevadas.</p></div><Link className={styles.button} href="/platform/suporte">Abrir Suporte</Link></div>
        <div className={styles.supportGrid}><SupportCard title="Busca global" text="Empresas e unidades podem ser localizadas com contexto comercial e operacional resumido." /><SupportCard title="Acesso controlado" text={canManage ? "Seu perfil pode administrar a plataforma através das ações controladas do PedeAqui." : "O perfil de suporte permanece em leitura e diagnóstico; alterações críticas ficam bloqueadas."} /><SupportCard title="Privacidade" text="A visão global evita carregar conteúdo de pedidos ou credenciais dos clientes." /></div>
      </section>

      <section className={styles.section} id="configuracao">
        <div className={styles.sectionHeader}><div><h2>Configuração da plataforma</h2><p>As capacidades avançadas ficam nas centrais especializadas, reduzindo alterações acidentais no painel principal.</p></div></div>
        <div className={styles.supportGrid}><SupportCard title="Planos" text={`${data.plans.length} plano(s) cadastrado(s). Gestão comercial em Assinaturas.`} /><SupportCard title="Catálogo" text={`${activeIntegrations} integração(ões) disponível(is). Diagnóstico em Integrações.`} /><SupportCard title="Perfil atual" text={canManage ? "Proprietário: leitura, diagnóstico e administração autorizada." : "Suporte: leitura e diagnóstico, sem administração crítica."} /></div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>; }
function SupportCard({ title, text }: { title: string; text: string }) { return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>; }
