import Link from "next/link";
import styles from "@/features/orders/order-manager.module.css";
import { formatStoreDate, formatStoreDateTime, DEFAULT_STORE_TIMEZONE } from "@/lib/store-date-time";
import { OrderDeliveryAttributionService } from "@/server/delivery/order-delivery-attribution-service";
import { OrderHistoryService, type OrderHistoryPeriod } from "@/server/orders/order-history-service";
import { OrderListPosition } from "@/features/orders/order-navigation-memory";

const statusLabels: Record<string, string> = {
  completed: "Finalizado",
  canceled: "Cancelado",
  rejected: "Recusado",
};

const fulfillmentLabels: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "Mesa",
  table: "Mesa",
};

const periodLabels: Record<OrderHistoryPeriod, string> = {
  all: "Todo histórico",
  today: "Hoje",
  week: "Esta semana",
  fortnight: "Últimos 15 dias",
  month: "Este mês",
  date: "Data específica",
};

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function queryFor(input: { search?: string; period?: OrderHistoryPeriod; date?: string; page?: number }) {
  return {
    ...(input.search ? { q: input.search } : {}),
    ...(input.period && input.period !== "all" ? { period: input.period } : {}),
    ...(input.period === "date" && input.date ? { date: input.date } : {}),
    ...(input.page && input.page > 1 ? { page: String(input.page) } : {}),
  };
}

export default async function OrderHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; period?: string; date?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const {
    context,
    orders,
    page,
    pageSize,
    search,
    period,
    selectedDate,
    dateRange,
    total,
    summary,
    hasPrevious,
    hasNext,
  } = await OrderHistoryService.list({
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: params.q ?? "",
    period: params.period,
    date: params.date,
  });
  const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;
  const returnQuery = new URLSearchParams(queryFor({ search, period, date: selectedDate, page })).toString();
  const returnTo = `/pedidos/historico${returnQuery ? `?${returnQuery}` : ""}`;
  const deliveryAttribution = await OrderDeliveryAttributionService.forOrders(
    orders.filter((order) => order.fulfillment_type === "delivery").map((order) => order.id),
  );
  const filterDescription = dateRange
    ? dateRange.startDate === dateRange.endDate
      ? formatStoreDate(dateRange.startIso, timeZone)
      : `${formatStoreDate(dateRange.startIso, timeZone)} a ${formatStoreDate(new Date(new Date(dateRange.endIso).getTime() - 1), timeZone)}`
    : "todos os períodos";

  return (
    <section className={styles.page}>
      <OrderListPosition storageKey="orders:history" />
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <p className={styles.pageEyebrow}>Consulta</p>
          <h1>Histórico de pedidos</h1>
          <p className={styles.pageHint}>Finalizados, cancelados e recusados ficam aqui e não ocupam o quadro da operação.</p>
        </div>
        <Link href="/pedidos" className={styles.detailsLink}>← Voltar para pedidos ativos</Link>
      </header>

      <form method="get" className={styles.historyToolbar}>
        <label className={styles.historySearchLabel}>
          <span>Buscar no histórico completo</span>
          <input name="q" type="search" defaultValue={search} placeholder="Nome do cliente ou número do pedido" maxLength={80} />
        </label>
        <button type="submit" className={styles.detailsLink}>Buscar</button>

        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", flexBasis: "100%", alignItems: "center" }}>
          {(Object.keys(periodLabels) as OrderHistoryPeriod[]).filter((value) => value !== "date").map((value) => (
            <button
              key={value}
              type="submit"
              name="period"
              value={value}
              className={period === value ? styles.activeBadge : styles.detailsLink}
              aria-pressed={period === value}
            >
              {periodLabels[value]}
            </button>
          ))}
        </div>

        <label className={styles.historySearchLabel} style={{ flex: "0 1 230px" }}>
          <span>Escolher um dia</span>
          <input name="date" type="date" defaultValue={selectedDate} />
        </label>
        <button type="submit" name="period" value="date" className={period === "date" ? styles.activeBadge : styles.detailsLink}>
          Ver esta data
        </button>

        {(search || period !== "all") ? <Link href="/pedidos/historico" className={styles.detailsLink}>Limpar filtros</Link> : null}
      </form>

      <div
        aria-label="Resumo do período"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <div className={styles.historyStatus}>
          <span>Pedidos no período</span><br />
          <strong style={{ fontSize: "1.35rem" }}>{summary.totalOrders}</strong>
        </div>
        <div className={styles.historyStatus}>
          <span>Valor vendido</span><br />
          <strong style={{ fontSize: "1.35rem" }}>{money(summary.soldTotalCents)}</strong>
        </div>
        <div className={styles.historyStatus}>
          <span>Ticket médio</span><br />
          <strong style={{ fontSize: "1.35rem" }}>{money(summary.averageTicketCents)}</strong>
          <span style={{ display: "block", marginTop: "var(--space-1)", opacity: 0.75 }}>
            {summary.completedOrders} pedido(s) finalizado(s)
          </span>
        </div>
      </div>

      <div className={styles.historyStatus} role="status">
        <strong>{periodLabels[period]}</strong> · {filterDescription}.{" "}
        {total === 0 ? "Nenhum resultado." : `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total} pedido(s).`}
        {total > pageSize ? " O histórico está paginado; nenhum pedido foi descartado." : ""}
      </div>

      <div className={styles.historyGrid}>
        {orders.map((order) => {
          const attribution = deliveryAttribution.get(order.id);
          return (
            <article key={order.id} className={styles.orderCard}>
              <div className={styles.cardTop}>
                <div className={styles.orderIdentity}>
                  <span className={styles.orderNumber}>#{order.display_number}</span>
                  <strong className={styles.customer}>{order.customer_name_snapshot}</strong>
                </div>
                <div className={styles.moneyTime}>
                  <span className={styles.total}>{money(order.total_cents)}</span>
                  <span className={styles.elapsed}>{formatStoreDateTime(order.updated_at, timeZone)}</span>
                </div>
              </div>

              <div className={styles.tags}>
                <span className={styles.tag}>{statusLabels[order.order_status] ?? order.order_status}</span>
                <span className={styles.tag}>{fulfillmentLabels[order.fulfillment_type] ?? order.fulfillment_type}</span>
                {order.order_status === "completed" && order.fulfillment_type === "delivery" ? (
                  <span className={styles.tag}>{attribution ? `Entregue por ${attribution.driverName}` : "Entregador não registrado"}</span>
                ) : null}
              </div>

              <Link href={{ pathname: `/pedidos/${order.id}`, query: { from: returnTo } }} className={styles.detailsLink}>Abrir detalhes</Link>
            </article>
          );
        })}
        {orders.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido encontrado para os filtros selecionados.</div> : null}
      </div>
      {(hasPrevious || hasNext) ? <nav className={styles.historyPagination} aria-label="Paginação do histórico">
        {hasPrevious ? <Link className={styles.detailsLink} href={{ pathname: "/pedidos/historico", query: queryFor({ search, period, date: selectedDate, page: page - 1 }) }}>← Página anterior</Link> : <span />}
        <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span>
        {hasNext ? <Link className={styles.detailsLink} href={{ pathname: "/pedidos/historico", query: queryFor({ search, period, date: selectedDate, page: page + 1 }) }}>Próxima página →</Link> : <span />}
      </nav> : null}
    </section>
  );
}
