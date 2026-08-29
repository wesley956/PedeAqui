import Link from "next/link";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { formatCents } from "@/server/catalog/money";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { DashboardService } from "@/server/dashboard/dashboard-service";
import { hourlyBarPercent, maxHourlySales, percentageDelta } from "@/server/dashboard/dashboard-model";
import { OnboardingReadinessService } from "@/server/onboarding/onboarding-readiness-service";
import styles from "./dashboard.module.css";

type MetricTone = "positive" | "negative" | "attention" | "neutral";
type MetricDefinition = { label: string; value: string; footer: string; tone: MetricTone };

function localDateLabel(value: string) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
function deltaLabel(current: number, previous: number) {
  const delta = percentageDelta(current, previous);
  if (delta === null) return { text: "Novo movimento vs. ontem", tone: "positive" as const };
  if (Math.abs(delta) < 0.05) return { text: "Sem variação vs. ontem", tone: "neutral" as const };
  return { text: `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. ontem`, tone: delta > 0 ? "positive" as const : "negative" as const };
}

const actionMeta: Record<string, { title: string; note: string; icon: string }> = {
  orders: { title: "Ver pedidos", note: "Acompanhar pedidos e próximas ações", icon: "🧾" },
  catalog: { title: "Editar cardápio", note: "Produtos, preços e adicionais", icon: "🍔" },
  pdv: { title: "Novo pedido no balcão", note: "Abrir o PDV", icon: "💵" },
  deliveries: { title: "Acompanhar entregas", note: "Pedidos em rota e atrasos", icon: "🚚" },
  settings: { title: "Configurar restaurante", note: "Horário, pagamentos, entrega...", icon: "⚙️" },
};

export default async function DashboardPage() {
  const [{ snapshot, operations }, access] = await Promise.all([DashboardService.snapshot(), NavigationAccessService.load()]);
  const readiness = await OnboardingReadinessService.load(access.context);
  const vocabulary = businessVocabulary(access.businessType);
  const productPluralTitle = vocabulary.productPlural.charAt(0).toUpperCase() + vocabulary.productPlural.slice(1);
  const salesDelta = deltaLabel(snapshot.sales_cents, snapshot.previous_sales_cents);
  const maxSales = maxHourlySales(snapshot.hourly);
  const moduleVisible = (key: string) => access.items.some((item) => item.key === key);
  const itemFor = (key: string) => access.items.find((item) => item.key === key);

  const totalOrdersToday = snapshot.sales_count + snapshot.open_orders;
  const attentionCount = operations.cancellationsToday
    + (moduleVisible("deliveries") ? operations.lateDeliveries : 0)
    + (moduleVisible("inventory") ? operations.criticalStockCount : 0);

  const setupChecks = [
    { label: "Dados da loja", done: readiness.storeProfileComplete, href: "/configuracoes/loja" },
    { label: "Cardápio", done: readiness.productCount > 0, href: "/cardapio/produtos" },
    { label: "Horários", done: readiness.hoursCount > 0, href: "/configuracoes/horarios" },
    { label: "Pagamentos", done: readiness.paymentMethodCount > 0, href: "/configuracoes/pagamentos" },
    ...(moduleVisible("deliveries") ? [{ label: "Entrega", done: readiness.deliveryConfigured, href: "/configuracoes/entrega" }] : []),
  ];
  const readyCount = setupChecks.filter((step) => step.done).length;
  const readinessPercent = setupChecks.length === 0 ? 100 : Math.round((readyCount / setupChecks.length) * 100);
  const pendingSetup = setupChecks.filter((step) => !step.done);

  const actions = ["orders", "catalog", "pdv", "deliveries", "settings"]
    .map((key) => ({ item: itemFor(key), meta: actionMeta[key] }))
    .filter((entry): entry is { item: NonNullable<typeof entry.item>; meta: { title: string; note: string; icon: string } } => Boolean(entry.item && entry.meta));

  const detailMetrics: MetricDefinition[] = [
    { label: "Pedidos abertos", value: String(snapshot.open_orders), footer: "Pendentes ou em andamento", tone: snapshot.open_orders > 0 ? "attention" : "neutral" },
    { label: "Cancelamentos", value: String(operations.cancellationsToday), footer: "Cancelados ou recusados hoje", tone: operations.cancellationsToday > 0 ? "negative" : "neutral" },
    ...(moduleVisible("deliveries") ? [{ label: "Entregas atrasadas", value: String(operations.lateDeliveries), footer: "Prazo prometido já vencido", tone: operations.lateDeliveries > 0 ? "negative" as const : "neutral" as const }] : []),
    ...(moduleVisible("cash") ? [{ label: "Caixas abertos", value: String(operations.openCashSessions), footer: operations.openCashSessions > 0 ? "Turnos em andamento" : "Nenhum turno aberto", tone: operations.openCashSessions > 0 ? "positive" as const : "neutral" as const }] : []),
  ];

  return <section className={styles.page} data-experience={access.experienceMode}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>HOJE</p><h1>Início</h1><p className="muted">O essencial para tocar sua {vocabulary.unitLabel} agora.</p></div>
      <div className={styles.dateBadge}>{localDateLabel(snapshot.local_date)}</div>
    </header>

    {readinessPercent < 100 ? <section className={styles.readiness} aria-label="Progresso de configuração">
      <div><span className={styles.eyebrow}>SEU NEGÓCIO</span><h2>Está quase tudo pronto</h2><p>O PedeAqui detectou o que já está configurado e mostra somente o que ainda merece atenção.</p></div>
      <div className={styles.readinessProgress}><strong>{readinessPercent}% configurado</strong><div className={styles.progressTrack}><span style={{ width: `${readinessPercent}%` }} /></div><small>{pendingSetup.length > 0 ? `Falta: ${pendingSetup.map((step) => step.label).join(" · ")}` : "Tudo pronto"}</small></div>
    </section> : null}

    <SectionTitle title="Hoje" description="Somente os números que ajudam a decidir o que fazer agora." />
    <div className={styles.metrics} aria-label="Indicadores principais de hoje">
      <Metric label="Vendas" value={formatCents(snapshot.sales_cents)} footer={salesDelta.text} tone={salesDelta.tone} />
      <Metric label="Pedidos" value={String(totalOrdersToday)} footer={`${snapshot.open_orders} em andamento`} tone={snapshot.open_orders > 0 ? "attention" : "neutral"} />
      <Metric label="Ticket médio" value={formatCents(snapshot.average_ticket_cents)} footer="Pedidos concluídos de hoje" tone="neutral" />
      <Metric label="Precisa de atenção" value={String(attentionCount)} footer={attentionCount > 0 ? "Pendências para revisar" : "Nada urgente agora"} tone={attentionCount > 0 ? "attention" : "positive"} />
    </div>

    <SectionTitle title="O que você quer fazer?" description="As ações mais usadas sempre à mão." />
    <div className={styles.actionsGrid}>
      {actions.map(({ item, meta }, index) => <HomeAction key={item.key} href={item.href} icon={meta.icon} title={meta.title} note={meta.note} primary={index === 0} />)}
      <HomeAction href="/mais-ferramentas" icon="•••" title="Mais ferramentas" note="Estoque, financeiro, clientes e outras áreas" />
    </div>

    <SectionTitle title="Precisa de atenção" description="Só mostramos aqui o que pode exigir uma ação." />
    <section className={styles.attentionPanel}>
      {snapshot.open_orders > 0 ? <AttentionRow href="/pedidos" title={`${snapshot.open_orders} pedido(s) em andamento`} description="Abra a fila para acompanhar as próximas ações." action="Ver pedidos" /> : null}
      {moduleVisible("deliveries") && operations.lateDeliveries > 0 ? <AttentionRow href="/entregas" title={`${operations.lateDeliveries} entrega(s) atrasada(s)`} description="O prazo prometido já venceu." action="Ver entregas" urgent /> : null}
      {moduleVisible("inventory") && operations.criticalStockCount > 0 ? <AttentionRow href="/estoque" title={`${operations.criticalStockCount} item(ns) com estoque crítico`} description={operations.criticalStock.length > 0 ? operations.criticalStock.map((item) => item.name).join(" · ") : "Revise os saldos mínimos."} action="Ver estoque" /> : null}
      {pendingSetup.slice(0, 2).map((step) => <AttentionRow key={step.label} href={step.href} title={`Configurar ${step.label.toLowerCase()}`} description="Essa etapa ainda não está pronta." action="Configurar" />)}
      {snapshot.open_orders === 0 && (!moduleVisible("deliveries") || operations.lateDeliveries === 0) && (!moduleVisible("inventory") || operations.criticalStockCount === 0) && pendingSetup.length === 0 ? <div className={styles.allGood}><strong>Tudo certo por aqui ✓</strong><span>Nenhuma pendência operacional importante agora.</span></div> : null}
    </section>

    {access.experienceMode === "standard" ? <>
      <SectionTitle title="Visão detalhada" description="Indicadores e análises para quando você quiser aprofundar." />
      <div className={styles.detailMetrics}>{detailMetrics.map((metric) => <Metric key={metric.label} {...metric} />)}</div>
      <div className={styles.grid}>
        <article className={styles.panel}><div className={styles.panelHeader}><div><h2>Vendas por hora</h2><p>Receita bruta de pedidos concluídos em cada hora local.</p></div><strong>{formatCents(snapshot.sales_cents)}</strong></div>{snapshot.hourly.every((point) => point.orders === 0) ? <div className={styles.empty}>Ainda não há pedidos concluídos hoje.</div> : <div className={styles.chart} aria-label="Gráfico de vendas por hora">{snapshot.hourly.map((point) => { const height = hourlyBarPercent(point.sales_cents, maxSales); return <div className={styles.hourColumn} key={point.hour} title={`${String(point.hour).padStart(2, "0")}:00 · ${formatCents(point.sales_cents)} · ${point.orders} pedido(s)`}><div className={styles.barTrack}><div className={styles.bar} style={{ height: `${height}%` }} /></div><span className={styles.hourLabel}>{point.hour % 3 === 0 || point.hour === 23 ? `${String(point.hour).padStart(2, "0")}h` : "·"}</span></div>; })}</div>}</article>
        <article className={styles.panel}><div className={styles.panelHeader}><div><h2>{productPluralTitle} mais vendidos</h2><p>Ranking de hoje por quantidade.</p></div></div>{snapshot.top_products.length === 0 ? <div className={styles.empty}>Os {vocabulary.productPlural} aparecem aqui assim que houver pedidos concluídos hoje.</div> : <div className={styles.productList}>{snapshot.top_products.map((product, index) => <div className={styles.productRow} key={product.product_key}><span className={styles.productRank}>{index + 1}</span><div className={styles.productIdentity}><strong>{product.name}</strong><span>{product.quantity} unidade(s)</span></div><div className={styles.productSales}>{formatCents(product.sales_cents)}</div></div>)}</div>}</article>
      </div>
    </> : null}
  </section>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div className={styles.sectionTitle}><div><h2>{title}</h2><p>{description}</p></div></div>;
}

function Metric({ label, value, footer, tone }: MetricDefinition) {
  return <article className={styles.metric} data-tone={tone}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong><span className={styles.metricFooter}>{footer}</span></article>;
}

function HomeAction({ href, icon, title, note, primary = false }: { href: string; icon: string; title: string; note: string; primary?: boolean }) {
  return <Link href={href} className={styles.actionCard} data-primary={primary || undefined}><span className={styles.actionIcon} aria-hidden>{icon}</span><span><strong>{title}</strong><small>{note}</small></span><em aria-hidden>→</em></Link>;
}

function AttentionRow({ href, title, description, action, urgent = false }: { href: string; title: string; description: string; action: string; urgent?: boolean }) {
  return <div className={styles.attentionRow} data-urgent={urgent || undefined}><div><strong>{title}</strong><span>{description}</span></div><Link href={href}>{action}</Link></div>;
}
