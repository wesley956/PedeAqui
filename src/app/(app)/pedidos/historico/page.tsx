import Link from "next/link";
import { OrderHistoryFilters, orderHistoryPeriodLabels as periodLabels, orderHistoryQuery as queryFor } from "@/features/orders/order-history-filters";
import styles from "@/features/orders/order-manager.module.css";
import { formatStoreDate, formatStoreDateTime, DEFAULT_STORE_TIMEZONE } from "@/lib/store-date-time";
import { OrderDeliveryAttributionService } from "@/server/delivery/order-delivery-attribution-service";
import { OrderHistoryService } from "@/server/orders/order-history-service";
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

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
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
    ? formatStoreDate(dateRange.startIso, timeZone) === formatStoreDate(new Date(new Date(dateRange.endIso).getTime() - 1), timeZone)
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

      <OrderHistoryFilters search={search} period={period} selectedDate={selectedDate} />
      <p className={styles.pageHint}>O período considera a data de criação do pedido no horário da loja ({timeZone}). O valor vendido soma somente pedidos finalizados.</p>

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
                  <span className={styles.elapsed}>Pedido em {formatStoreDateTime(order.created_at, timeZone)}</span>
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
