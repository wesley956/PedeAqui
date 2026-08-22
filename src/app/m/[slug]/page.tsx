import Link from "next/link";
import { notFound } from "next/navigation";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { MenuBrowser } from "@/features/menu/menu-browser";
import { RestaurantBrand, restaurantBrandVars } from "@/features/menu/public-brand";
import { PublicMenuService } from "@/server/menu/public-menu-service";
import styles from "./public-menu.module.css";

const statusCopy = { open: ["Aberto", "Aceitando pedidos"], closed: ["Fechado", "Você pode consultar o cardápio"], paused: ["Pausado", "Novos pedidos estão temporariamente pausados"] } as const;
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await PublicMenuService.getMenu(slug);
  if (!menu) notFound();
  const [status, detail] = statusCopy[menu.operational.label];
  const deliveryAvailable = menu.settings.allow_delivery && menu.delivery.enabled;
  const statusClass = menu.operational.label === "open" ? styles.statusOpen : menu.operational.label === "paused" ? styles.statusPaused : "";
  return <main className={styles.root} style={restaurantBrandVars(menu.settings.primary_color)}>
    <div className={styles.cover} style={menu.settings.cover_url ? { backgroundImage: `url(${menu.settings.cover_url})` } : undefined} aria-hidden />
    <div className={styles.container}>
      <header className={styles.hero}>
        <RestaurantBrand name={menu.store.name} logoUrl={menu.settings.logo_url} primaryColor={menu.settings.primary_color}>
          <span className={`${styles.status} ${statusClass}`}>{status}</span>
          <p className={styles.brandDetail}>{detail}{menu.settings.pause_reason && menu.operational.label === "paused" ? ` — ${menu.settings.pause_reason}` : ""}</p>
          {(menu.store.city || menu.store.state) ? <p className={styles.location}>{[menu.store.city, menu.store.state].filter(Boolean).join(" - ")}</p> : null}
        </RestaurantBrand>
        <Link href={`/m/${menu.store.slug}/carrinho`} className={styles.cart}>Ver carrinho</Link>
      </header>
      <div className={styles.content}>
        <div className={styles.serviceSummary} aria-label="Opções do pedido">
          {deliveryAvailable ? <span className={styles.pill}>Entrega · a partir de {money(menu.delivery.starting_fee_cents)}</span> : null}
          {deliveryAvailable ? <span className={styles.pill}>{menu.delivery.estimated_min_minutes}–{menu.delivery.estimated_max_minutes} min</span> : null}
          {menu.settings.allow_pickup ? <span className={styles.pill}>Retirada disponível</span> : null}
          {menu.settings.minimum_order_cents > 0 ? <span className={styles.pill}>Pedido mínimo {money(menu.settings.minimum_order_cents)}</span> : null}
          {deliveryAvailable && menu.delivery.free_delivery_over_cents !== null ? <span className={styles.pill}>Frete grátis acima de {money(menu.delivery.free_delivery_over_cents)}</span> : null}
        </div>
        <MenuBrowser menu={{
          store: { slug: menu.store.slug },
          settings: {
            show_search: menu.settings.show_search,
            show_categories: menu.settings.show_categories,
            show_product_images: menu.settings.show_product_images,
          },
          categories: menu.categories,
        }} canOrder={menu.operational.canOrder} />
      </div>
      <footer className={styles.signature} aria-label="PedeAqui — Seu pedido começa aqui"><PedeAquiLogo size="xs" decorative /><span>Seu pedido começa aqui.</span></footer>
    </div>
  </main>;
}
