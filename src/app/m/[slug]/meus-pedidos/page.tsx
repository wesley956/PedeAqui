import Link from "next/link";
import { cookies } from "next/headers";
import { loadRecentPublicOrders, recentOrderStatus } from "@/server/orders/recent-public-orders-service";
import { recentOrdersCookieName } from "@/server/orders/recent-order-token";
import styles from "../public-menu.module.css";

export default async function RecentOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const orders = await loadRecentPublicOrders(slug, (await cookies()).get(recentOrdersCookieName(slug))?.value);
  return <main className={styles.root}><div className={styles.container}>
    <header className={styles.expressHeader}><div><h1>Meus pedidos</h1><p>Acompanhe os pedidos feitos neste navegador.</p></div><Link href={`/m/${slug}`}>Ver cardápio</Link></header>
    {orders.length ? orders.map(({ order }) => <Link className={styles.recentOrder} key={order.id} href={`/m/${slug}/pedido-atual?id=${order.id}`} prefetch={false}>
      <div><strong>Pedido #{order.display_number}</strong><span>{recentOrderStatus(order)}</span><span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.total_cents / 100)}</span></div><strong>Acompanhar pedido →</strong>
    </Link>) : <section className={styles.recentOrder}><div><h2>Seu pedido aparece aqui depois da confirmação</h2><p>Se você fez o pedido em outro aparelho, abra o link de acompanhamento enviado pela loja. Você não precisa fazer o pedido novamente.</p><Link href={`/m/${slug}`}>Voltar ao cardápio</Link></div></section>}
  </div></main>;
}
