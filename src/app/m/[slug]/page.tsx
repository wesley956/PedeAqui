import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuBrowser } from "@/features/menu/menu-browser";
import { PedeAquiSignature, RestaurantBrand } from "@/features/menu/public-brand";
import { PublicMenuService } from "@/server/menu/public-menu-service";

const statusCopy = { open: ["Aberto", "Aceitando pedidos"], closed: ["Fechado", "Você pode consultar o cardápio"], paused: ["Pausado", "Novos pedidos estão temporariamente pausados"] } as const;
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await PublicMenuService.getMenu(slug);
  if (!menu) notFound();
  const [status, detail] = statusCopy[menu.operational.label];
  const deliveryAvailable = menu.settings.allow_delivery && menu.delivery.enabled;
  return <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818" }}>
    <div style={{ height: 150, background: menu.settings.cover_url ? `url(${menu.settings.cover_url}) center/cover` : `linear-gradient(135deg, ${menu.settings.primary_color}, #171717)` }} />
    <div style={{ width: "min(920px, calc(100% - 24px))", margin: "-38px auto 0", paddingBottom: 64 }}>
      <header style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 22, padding: 18, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 12px 35px rgba(24,24,24,.08)" }}>
        <RestaurantBrand name={menu.store.name} logoUrl={menu.settings.logo_url} primaryColor={menu.settings.primary_color}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 11, fontWeight: 900 }}>{status}</span></div>
          <p style={{ color: "#716b64", margin: 0 }}>{detail}{menu.settings.pause_reason && menu.operational.label === "paused" ? ` — ${menu.settings.pause_reason}` : ""}</p>
          {(menu.store.city || menu.store.state) ? <p style={{ color: "#8a837b", margin: 0, fontSize: 12 }}>{[menu.store.city, menu.store.state].filter(Boolean).join(" - ")}</p> : null}
        </RestaurantBrand>
        <Link href={`/m/${menu.store.slug}/carrinho`} style={{ marginLeft: "auto", flexShrink: 0, background: "#171717", color: "#fffdf9", borderRadius: 13, padding: "10px 13px", fontWeight: 900, fontSize: 13 }}>Carrinho</Link>
      </header>
      <div style={{ display: "grid", gap: 18, marginTop: 20 }}><div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>{deliveryAvailable ? <span style={modePill}>Entrega · a partir de {money(menu.delivery.starting_fee_cents)}</span> : null}{deliveryAvailable ? <span style={modePill}>{menu.delivery.estimated_min_minutes}–{menu.delivery.estimated_max_minutes} min</span> : null}{menu.settings.allow_pickup ? <span style={modePill}>Retirada</span> : null}{menu.settings.minimum_order_cents > 0 ? <span style={modePill}>Mínimo {money(menu.settings.minimum_order_cents)}</span> : null}{deliveryAvailable && menu.delivery.free_delivery_over_cents !== null ? <span style={modePill}>Frete grátis acima de {money(menu.delivery.free_delivery_over_cents)}</span> : null}</div><MenuBrowser menu={menu} /></div>
      <PedeAquiSignature />
    </div>
  </main>;
}
const modePill: React.CSSProperties = { padding: "7px 10px", borderRadius: 999, background: "#f4efe9", color: "#514b45", fontWeight: 700 };
