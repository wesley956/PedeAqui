import Link from "next/link";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { formatCents } from "@/server/catalog/money";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { DashboardService } from "@/server/dashboard/dashboard-service";
import { hourlyBarPercent, maxHourlySales, percentageDelta } from "@/server/dashboard/dashboard-model";
import styles from "./dashboard.module.css";

function localDateLabel(value: string) { const [year, month, day] = value.split("-"); void year; return `${day}/${month}/${year}`; }
function deltaLabel(current: number, previous: number) {
  const delta = percentageDelta(current, previous);
  if (delta === null) return { text: "Novo movimento vs. ontem", tone: "positive" as const };
  if (Math.abs(delta) < 0.05) return { text: "Sem variação vs. ontem", tone: "neutral" as const };
  return { text: `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. ontem`, tone: delta > 0 ? "positive" as const : "negative" as const };
}

export default async function DashboardPage() {
  const [{ snapshot, operations }, access] = await Promise.all([DashboardService.snapshot(), NavigationAccessService.load()]);
  const vocabulary = businessVocabulary(access.businessType);
  const salesDelta = deltaLabel(snapshot.sales_cents, snapshot.previous_sales_cents);
  const ordersDelta = deltaLabel(snapshot.sales_count, snapshot.previous_sales_count);
  const maxSales = maxHourlySales(snapshot.hourly);
  const moduleVisible = (key: string) => access.items.some((item) => item.key === key);

  const metrics = [
    { label: "Vendas hoje", value: formatCents(snapshot.sales_cents), footer: salesDelta.text, tone: salesDelta.tone, module: null },
    { label: "Pedidos concluídos", value: String(snapshot.sales_count), footer: ordersDelta.text, tone: ordersDelta.tone, module: null },
    { label: "Ticket médio", value: formatCents(snapshot.average_ticket_cents), footer: "Concluídos de hoje", tone: "neutral" as const, module: null },
    { label: "Pedidos abertos", value: String(snapshot.open_orders), footer: "Pendentes ou em andamento", tone: snapshot.open_orders > 0 ? "attention" as const : "neutral" as const, module: null },
    { label: "Cancelamentos", value: String(operations.cancellationsToday), footer: "Cancelados ou recusados hoje", tone: operations.cancellationsToday > 0 ? "negative" as const : "neutral" as const, module: null },
    { label: "Entregas atrasadas", value: String(operations.lateDeliveries), footer: "Prazo prometido já vencido", tone: operations.lateDeliveries > 0 ? "negative" as const : "neutral" as const, module: "deliveries" },
    { label: "Caixas abertos", value: String(operations.openCashSessions), footer: operations.openCashSessions > 0 ? "Turnos de caixa em andamento" : "Nenhum turno aberto", tone: operations.openCashSessions > 0 ? "positive" as const : "neutral" as const, module: "cash" },
    { label: "Estoque crítico", value: String(operations.criticalStockCount), footer: "Saldo no ou abaixo do mínimo", tone: operations.criticalStockCount > 0 ? "attention" as const : "neutral" as const, module: "inventory" },
  ].filter((metric) => !metric.module || moduleVisible(metric.module));
  const visibleMetrics = access.experienceMode === "easy" ? metrics.slice(0, 4) : metrics;
  const easyActions = access.items.filter((item) => item.easyPrimary).slice(0, 6);

  if (access.experienceMode === "easy") {
    return <section className={styles.page} data-experience="easy">
      <header className={styles.header}><div><p className="muted" style={{ margin: 0 }}>HOJE · MODO FÁCIL</p><h1>Início</h1><p className="muted">O essencial da sua {vocabulary.unitLabel}, sem informações desnecessárias.</p></div><div className={styles.dateBadge}>{localDateLabel(snapshot.local_date)}</div></header>
      <div className={styles.metrics} aria-label="Indicadores principais">{visibleMetrics.map((metric) => <article className={styles.metric} data-tone={metric.tone} key={metric.label}><span className={styles.metricLabel}>{metric.label}</span><strong className={styles.metricValue}>{metric.value}</strong><span className={styles.metricFooter}>{metric.footer}</span></article>)}</div>
      <section className={styles.signals} aria-labelledby="easy-actions"><div className={styles.panelHeader}><div><h2 id="easy-actions">O que você quer fazer?</h2><p>Somente ações que você já tem permissão para usar.</p></div></div><div className={styles.signalGrid}>{easyActions.map((item) => <Signal key={item.key} href={item.href} label={item.label} value="Abrir ferramenta" />)}</div></section>
    </section>;
  }

  return <section className={styles.page}>
    <header className={styles.header}><div><p className="muted" style={{ margin: 0 }}>GESTÃO · HOJE</p><h1>Dashboard</h1><p className="muted">Visão da unidade ativa. Vendas e comparação usam pedidos concluídos; alertas aparecem somente para módulos disponíveis.</p></div><div className={styles.dateBadge}>{localDateLabel(snapshot.local_date)} · {snapshot.timezone}</div></header>
    <div className={styles.metrics} aria-label="Indicadores principais de hoje">{visibleMetrics.map((metric) => <article className={styles.metric} data-tone={metric.tone} key={metric.label}><span className={styles.metricLabel}>{metric.label}</span><strong className={styles.metricValue}>{metric.value}</strong><span className={styles.metricFooter}>{metric.footer}</span></article>)}</div>
    <section className={styles.signals} aria-labelledby="dashboard-signals-title"><div className={styles.panelHeader}><div><h2 id="dashboard-signals-title">Atenção operacional</h2><p>Atalhos para as ferramentas disponíveis que explicam e resolvem os números acima.</p></div></div><div className={styles.signalGrid}>
      <Signal href="/pedidos" label="Pedidos" value={`${snapshot.open_orders} aberto(s) · ${operations.cancellationsToday} cancelamento(s)`} attention={operations.cancellationsToday > 0} />
      {moduleVisible("deliveries") ? <Signal href="/entregas" label="Entregas" value={operations.lateDeliveries > 0 ? `${operations.lateDeliveries} atrasada(s)` : "Sem atraso pelo prazo prometido"} attention={operations.lateDeliveries > 0} /> : null}
      {moduleVisible("cash") ? <Signal href="/caixa" label="Caixa" value={operations.openCashSessions > 0 ? `${operations.openCashSessions} turno(s) aberto(s)` : "Nenhum turno aberto"} /> : null}
      {moduleVisible("inventory") ? <Signal href="/estoque" label="Estoque" value={operations.criticalStockCount > 0 ? `${operations.criticalStockCount} item(ns) no mínimo` : "Nenhum item no mínimo"} attention={operations.criticalStockCount > 0} /> : null}
    </div>{moduleVisible("inventory") && operations.criticalStock.length > 0 ? <div className={styles.stockPreview}><strong>Reposição prioritária:</strong> {operations.criticalStock.map((item) => item.name).join(" · ")}</div> : null}</section>
    <div className={styles.grid}>
      <article className={styles.panel}><div className={styles.panelHeader}><div><h2>Vendas por hora</h2><p>Receita bruta de pedidos concluídos em cada hora local.</p></div><strong>{formatCents(snapshot.sales_cents)}</strong></div>{snapshot.hourly.every((point) => point.orders === 0) ? <div className={styles.empty}>Ainda não há pedidos concluídos hoje.</div> : <div className={styles.chart} aria-label="Gráfico de vendas por hora">{snapshot.hourly.map((point) => { const height = hourlyBarPercent(point.sales_cents, maxSales); return <div className={styles.hourColumn} key={point.hour} title={`${String(point.hour).padStart(2, "0")}:00 · ${formatCents(point.sales_cents)} · ${point.orders} pedido(s)`}><div className={styles.barTrack}><div className={styles.bar} style={{ height: `${height}%` }} /></div><span className={styles.hourLabel}>{point.hour % 3 === 0 || point.hour === 23 ? `${String(point.hour).padStart(2, "0")}h` : "·"}</span></div>; })}</div>}</article>
      <article className={styles.panel}><div className={styles.panelHeader}><div><h2>{vocabulary.productPlural[0].toUpperCase() + vocabulary.productPlural.slice(1)} mais vendidos</h2><p>Ranking de hoje por quantidade.</p></div></div>{snapshot.top_products.length === 0 ? <div className={styles.empty}>Os {vocabulary.productPlural} aparecem aqui assim que houver pedidos concluídos hoje.</div> : <div className={styles.productList}>{snapshot.top_products.map((product, index) => <div className={styles.productRow} key={product.product_key}><span className={styles.productRank}>{index + 1}</span><div className={styles.productIdentity}><strong>{product.name}</strong><span>{product.quantity} unidade(s)</span></div><div className={styles.productSales}>{formatCents(product.sales_cents)}</div></div>)}</div>}</article>
    </div>
  </section>;
}

function Signal({ href, label, value, attention = false }: { href: string; label: string; value: string; attention?: boolean }) {
  return <Link href={href} className={styles.signal} data-attention={attention || undefined}><strong>{label}</strong><span>{value}</span><em>Abrir →</em></Link>;
}
