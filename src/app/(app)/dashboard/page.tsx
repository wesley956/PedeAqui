import { formatCents } from "@/server/catalog/money";
import { DashboardService } from "@/server/dashboard/dashboard-service";
import { hourlyBarPercent, maxHourlySales, percentageDelta } from "@/server/dashboard/dashboard-model";
import styles from "./dashboard.module.css";

function localDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function deltaLabel(current: number, previous: number) {
  const delta = percentageDelta(current, previous);
  if (delta === null) return { text: "Novo movimento vs. ontem", tone: "positive" as const };
  if (Math.abs(delta) < 0.05) return { text: "Sem variação vs. ontem", tone: "neutral" as const };
  return {
    text: `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. ontem`,
    tone: delta > 0 ? "positive" as const : "negative" as const,
  };
}

export default async function DashboardPage() {
  const { snapshot } = await DashboardService.snapshot();
  const salesDelta = deltaLabel(snapshot.sales_cents, snapshot.previous_sales_cents);
  const ordersDelta = deltaLabel(snapshot.sales_count, snapshot.previous_sales_count);
  const maxSales = maxHourlySales(snapshot.hourly);

  const metrics = [
    { label: "Vendas hoje", value: formatCents(snapshot.sales_cents), footer: salesDelta.text, tone: salesDelta.tone },
    { label: "Pedidos concluídos", value: String(snapshot.sales_count), footer: ordersDelta.text, tone: ordersDelta.tone },
    { label: "Ticket médio", value: formatCents(snapshot.average_ticket_cents), footer: "Pedidos concluídos de hoje", tone: "neutral" as const },
    { label: "Pedidos abertos", value: String(snapshot.open_orders), footer: "Pendentes ou em andamento", tone: "neutral" as const },
    { label: "Clientes atendidos", value: String(snapshot.customer_count), footer: "Clientes identificados hoje", tone: "neutral" as const },
  ];

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Visão operacional da unidade ativa, calculada sobre pedidos concluídos.</p>
        </div>
        <div className={styles.dateBadge}>{localDateLabel(snapshot.local_date)} · {snapshot.timezone}</div>
      </header>

      <div className={styles.metrics}>
        {metrics.map((metric) => (
          <article className={`card ${styles.metric}`} key={metric.label}>
            <span className={styles.metricLabel}>{metric.label}</span>
            <strong className={styles.metricValue}>{metric.value}</strong>
            <span className={`${styles.metricFooter} ${metric.tone === "positive" ? styles.positive : metric.tone === "negative" ? styles.negative : ""}`}>
              {metric.footer}
            </span>
          </article>
        ))}
      </div>

      <div className={styles.grid}>
        <article className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Vendas por hora</h2>
              <p>Receita bruta de pedidos concluídos em cada hora local.</p>
            </div>
            <strong>{formatCents(snapshot.sales_cents)}</strong>
          </div>

          <div className={styles.chart} aria-label="Gráfico de vendas por hora">
            {snapshot.hourly.map((point) => {
              const height = hourlyBarPercent(point.sales_cents, maxSales);
              return (
                <div className={styles.hourColumn} key={point.hour} title={`${String(point.hour).padStart(2, "0")}:00 · ${formatCents(point.sales_cents)} · ${point.orders} pedido(s)`}>
                  <div className={styles.barTrack}>
                    <div className={styles.bar} style={{ height: `${height}%` }} />
                  </div>
                  <span className={styles.hourLabel}>{point.hour % 3 === 0 || point.hour === 23 ? `${String(point.hour).padStart(2, "0")}h` : "·"}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Produtos mais vendidos</h2>
              <p>Ranking de hoje por quantidade, usando o nome salvo no pedido.</p>
            </div>
          </div>

          {snapshot.top_products.length === 0 ? (
            <div className={styles.empty}>Os produtos aparecem aqui assim que houver pedidos concluídos hoje.</div>
          ) : (
            <div className={styles.productList}>
              {snapshot.top_products.map((product, index) => (
                <div className={styles.productRow} key={product.product_key}>
                  <span className={styles.productRank}>{index + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.productName}><strong>{product.name}</strong></div>
                    <div className={styles.productMeta}>{product.quantity} unidade(s)</div>
                  </div>
                  <div className={styles.productSales}>{formatCents(product.sales_cents)}</div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
