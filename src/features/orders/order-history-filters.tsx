import Link from "next/link";
import type { OrderHistoryPeriod } from "@/server/orders/order-history-service";
import styles from "./order-manager.module.css";

export const orderHistoryPeriodLabels: Record<OrderHistoryPeriod, string> = {
  all: "Todo histórico", today: "Hoje", week: "Esta semana", fortnight: "Últimos 15 dias", month: "Este mês", date: "Data específica",
};

export function orderHistoryQuery(input: { search?: string; period?: OrderHistoryPeriod; date?: string; page?: number }) {
  return {
    ...(input.search ? { q: input.search } : {}),
    ...(input.period && input.period !== "all" ? { period: input.period } : {}),
    ...(input.period === "date" && input.date ? { date: input.date } : {}),
    ...(input.page && input.page > 1 ? { page: String(input.page) } : {}),
  };
}

export function OrderHistoryFilters({ search, period, selectedDate }: { search: string; period: OrderHistoryPeriod; selectedDate: string }) {
  return <div className={styles.historyToolbar}>
    <form method="get" action="/pedidos/historico" aria-label="Buscar no período selecionado" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", flexBasis: "100%", alignItems: "end" }}>
      <input type="hidden" name="period" value={period} />
      {period === "date" ? <input type="hidden" name="date" value={selectedDate} /> : null}
      <label className={styles.historySearchLabel}><span>{period === "all" ? "Buscar no histórico completo" : "Buscar no período selecionado"}</span><input name="q" type="search" defaultValue={search} placeholder="Nome do cliente ou número do pedido" maxLength={80} /></label>
      <button type="submit" className={styles.detailsLink}>Buscar</button>
    </form>
    <nav aria-label="Períodos do histórico" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", flexBasis: "100%", alignItems: "center" }}>
      {(Object.keys(orderHistoryPeriodLabels) as OrderHistoryPeriod[]).filter(value => value !== "date").map(value => <Link key={value} prefetch={false} href={{ pathname: "/pedidos/historico", query: orderHistoryQuery({ search, period: value }) }} className={period === value ? styles.activeBadge : styles.detailsLink} aria-current={period === value ? "page" : undefined}>{orderHistoryPeriodLabels[value]}</Link>)}
    </nav>
    <form method="get" action="/pedidos/historico" aria-label="Consultar um dia específico" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "end" }}>
      <input type="hidden" name="period" value="date" />
      <input type="hidden" name="q" value={search} />
      <label className={styles.historySearchLabel} style={{ flex: "0 1 230px" }}><span>Escolher um dia</span><input name="date" type="date" defaultValue={selectedDate} required /></label>
      <button type="submit" className={period === "date" ? styles.activeBadge : styles.detailsLink}>Ver esta data</button>
    </form>
    {(search || period !== "all") ? <Link href="/pedidos/historico" className={styles.detailsLink}>Limpar filtros</Link> : null}
  </div>;
}
