import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { PublicCartBar } from "@/features/cart/public-cart-bar";
import { MenuBrowser } from "@/features/menu/menu-browser";
import { RestaurantBrand, restaurantBrandVars } from "@/features/menu/public-brand";
import { StoreInformationSheet } from "@/features/menu/store-information-sheet";
import { cartCookieName } from "@/server/cart/cart-token";
import { PublicCartQuickLinesService, type PublicCartQuickLine } from "@/server/cart/public-cart-quick-lines-service";
import { PublicMenuService } from "@/server/menu/public-menu-service";
import styles from "./public-menu.module.css";

// Keep the public menu fresh while allowing Vercel to serve repeated anonymous
// visits from the cache instead of invoking a server function for every hit.
export const revalidate = 30;

const statusCopy = { open: ["Aberto", "Aceitando pedidos"], closed: ["Fechado", "Você pode consultar o cardápio"], paused: ["Pausado", "Novos pedidos estão temporariamente pausados"] } as const;
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await PublicMenuService.getMenu(slug);
  if (!menu) notFound();
  const cartToken = (await cookies()).get(cartCookieName(menu.store.slug))?.value ?? null;
  let quickLines: Record<string, PublicCartQuickLine> = {};
  try {
    quickLines = await PublicCartQuickLinesService.get(menu.store.slug, cartToken);
  } catch {
    // As quantidades na lista são um atalho; sem elas o cardápio continua com o botão de adicionar.
    quickLines = {};
  }
  const [status] = statusCopy[menu.operational.label];
  const deliveryAvailable = menu.settings.allow_delivery && menu.delivery.enabled;
  const statusClass = menu.operational.label === "open" ? styles.statusOpen : menu.operational.label === "paused" ? styles.statusPaused : "";
  const etaLabel = deliveryAvailable ? `${menu.delivery.estimated_min_minutes}–${menu.delivery.estimated_max_minutes} min` : menu.settings.allow_pickup ? "Retirada no local" : null;
  const headline = [etaLabel, menu.settings.minimum_order_cents > 0 ? `mínimo ${money(menu.settings.minimum_order_cents)}` : null].filter(Boolean).join(" · ");
  const serviceFacts = [
    deliveryAvailable ? `Entrega a partir de ${money(menu.delivery.starting_fee_cents)}` : null,
    deliveryAvailable && menu.delivery.free_delivery_over_cents !== null ? `Frete grátis acima de ${money(menu.delivery.free_delivery_over_cents)}` : null,
    menu.settings.allow_pickup && deliveryAvailable ? "Retirada disponível" : null,
  ].filter((fact): fact is string => Boolean(fact));
  const closedNotice = menu.operational.label === "closed"
    ? `Estamos fechados agora.${menu.operational.nextOpening ? ` Abrimos ${menu.operational.nextOpening.label}.` : ""}`
    : menu.operational.label === "paused" ? `Pedidos pausados no momento${menu.settings.pause_reason ? `: ${menu.settings.pause_reason}` : "."}` : null;
  return <main className={styles.root} style={restaurantBrandVars(menu.settings.primary_color)}>
    <div className={styles.container}>
      <header className={styles.expressHeader}>
        <RestaurantBrand name={menu.store.name} logoUrl={menu.settings.logo_url} primaryColor={menu.settings.primary_color}>
          <p className={styles.statusLine} aria-label="Opções do pedido">
            <span className={`${styles.status} ${statusClass}`}>{menu.operational.label === "open" ? "Aberto agora" : status}</span>
            {headline ? <span className={styles.headline}>{headline}</span> : null}
          </p>
        </RestaurantBrand>
        <StoreInformationSheet store={{
          name: menu.store.name,
          phone: menu.store.phone,
          postal_code: menu.store.postal_code,
          street: menu.store.street,
          number: menu.store.number,
          complement: menu.store.complement,
          district: menu.store.district,
          city: menu.store.city,
          state: menu.store.state,
          public_whatsapp: menu.store.public_whatsapp,
          website_url: menu.store.website_url,
          instagram_url: menu.store.instagram_url,
          facebook_url: menu.store.facebook_url,
          tiktok_url: menu.store.tiktok_url,
        }} hours={menu.hours} serviceFacts={serviceFacts} />
      </header>
      {closedNotice ? <div className={styles.closedNotice} role="status">{closedNotice}</div> : null}
      <div className={styles.content}>
        <MenuBrowser menu={{
          store: { slug: menu.store.slug },
          settings: {
            show_search: menu.settings.show_search,
            show_categories: menu.settings.show_categories,
            show_product_images: menu.settings.show_product_images,
          },
          categories: menu.categories,
        }} canOrder={menu.operational.canOrder} productOptions={menu.productOptions} quickLines={quickLines} allowQuickAdd={menu.businessType !== "gas"} />
      </div>
      <footer className={styles.signature} aria-label="PedeAqui — Seu pedido começa aqui"><PedeAquiLogo size="xs" decorative /><span>Seu pedido começa aqui.</span></footer>
    </div>
    <PublicCartBar storeSlug={menu.store.slug} subtitle={!menu.operational.canOrder ? "Loja fechada agora" : deliveryAvailable ? `Entrega em ${etaLabel}` : etaLabel ?? undefined} />
  </main>;
}
