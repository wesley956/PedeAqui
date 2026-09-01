import Link from "next/link";
import styles from "@/features/orders/order-manager.module.css";
import { formatStoreDateTime, DEFAULT_STORE_TIMEZONE } from "@/lib/store-date-time";
import { OrderDeliveryAttributionService } from "@/server/delivery/order-delivery-attribution-service";
import { OrderService } from "@/server/orders/order-service";

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

export default async function OrderHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const { context, orders, page, pageSize, search, total, hasPrevious, hasNext } = await OrderService.listHistory({
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: params.q ?? "",
  });
  const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;
  const deliveryAttribution = await OrderDeliveryAttributionService.forOrders(
    orders.filter((order) => order.fulfillment_type === "delivery").map((order) => order.id),
  );

  return (
    <section className={styles.page}>
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
        {search ? <Link href="/pedidos/historico" className={styles.detailsLink}>Limpar</Link> : null}
      </form>

      <div className={styles.historyStatus} role="status">
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

              <Link href={`/pedidos/${order.id}`} className={styles.detailsLink}>Abrir detalhes</Link>
            </article>
          );
        })}
        {orders.length === 0 ? <div className={styles.emptyLane}>Nenhum pedido finalizado, cancelado ou recusado.</div> : null}
      </div>
      {(hasPrevious || hasNext) ? <nav className={styles.historyPagination} aria-label="Paginação do histórico">
        {hasPrevious ? <Link className={styles.detailsLink} href={{ pathname: "/pedidos/historico", query: { ...(search ? { q: search } : {}), page: page - 1 } }}>← Página anterior</Link> : <span />}
        <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span>
        {hasNext ? <Link className={styles.detailsLink} href={{ pathname: "/pedidos/historico", query: { ...(search ? { q: search } : {}), page: page + 1 } }}>Próxima página →</Link> : <span />}
      </nav> : null}
    </section>
  );
}
