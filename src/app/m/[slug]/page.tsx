import Link from "next/link";
import { notFound } from "next/navigation";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { MenuBrowser } from "@/features/menu/menu-browser";
import { PublicMenuService } from "@/server/menu/public-menu-service";

const statusCopy = {
  open: ["Aberto", "Aceitando pedidos"],
  closed: ["Fechado", "Você pode consultar o cardápio"],
  paused: ["Pausado", "Novos pedidos estão temporariamente pausados"],
} as const;

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await PublicMenuService.getMenu(slug);
  if (!menu) notFound();

  const [status, detail] = statusCopy[menu.operational.label];
  const deliveryAvailable = menu.settings.allow_delivery && menu.delivery.enabled;

  return (
    <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818" }}>
      <div style={{ height: 150, background: menu.settings.cover_url ? `url(${menu.settings.cover_url}) center/cover` : `linear-gradient(135deg, ${menu.settings.primary_color}, #171717)` }} />
      <div style={{ width: "min(920px, calc(100% - 24px))", margin: "-38px auto 0", paddingBottom: 64 }}>
        <header style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 22, padding: 18, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 12px 35px rgba(24,24,24,.08)" }}>
          {menu.settings.logo_url ? (
            <img src={menu.settings.logo_url} alt={`Logo ${menu.store.name}`} width={74} height={74} style={{ width: 74, height: 74, objectFit: "cover", borderRadius: 18, border: "1px solid #eee7df" }} />
          ) : (
            <div aria-hidden style={{ width: 74, height: 74, borderRadius: 18, background: menu.settings.primary_color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 950, fontSize: 28 }}>P</div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 24 }}>{menu.store.name}</h1>
              <span style={{ fontSize: 11, fontWeight: 900, padding: "5px 8px", borderRadius: 999, background: menu.operational.label === "open" ? "#dcfce7" : menu.operational.label === "paused" ? "#fff0db" : "#f3f0ec", color: menu.operational.label === "open" ? "#166534" : menu.operational.label === "paused" ? "#a84b00" : "#625d57" }}>{status}</span>
            </div>
            <p style={{ color: "#716b64", margin: "5px 0 0" }}>{detail}{menu.settings.pause_reason && menu.operational.label === "paused" ? ` — ${menu.settings.pause_reason}` : ""}</p>
            {(menu.store.city || menu.store.state) ? <p style={{ color: "#8a837b", margin: "4px 0 0", fontSize: 12 }}>{[menu.store.city, menu.store.state].filter(Boolean).join(" - ")}</p> : null}
          </div>
          <Link href={`/m/${menu.store.slug}/carrinho`} style={{ flexShrink: 0, background: "#171717", color: "#fffdf9", borderRadius: 13, padding: "10px 13px", fontWeight: 900, fontSize: 13 }}>Carrinho</Link>
        </header>

        <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            {deliveryAvailable ? <span style={modePill}>Entrega · a partir de {money(menu.delivery.starting_fee_cents)}</span> : null}
            {deliveryAvailable ? <span style={modePill}>{menu.delivery.estimated_min_minutes}–{menu.delivery.estimated_max_minutes} min</span> : null}
            {menu.settings.allow_pickup ? <span style={modePill}>Retirada</span> : null}
            {menu.settings.minimum_order_cents > 0 ? <span style={modePill}>Mínimo {money(menu.settings.minimum_order_cents)}</span> : null}
            {deliveryAvailable && menu.delivery.free_delivery_over_cents !== null ? <span style={modePill}>Frete grátis acima de {money(menu.delivery.free_delivery_over_cents)}</span> : null}
          </div>
          <MenuBrowser menu={menu} />
        </div>

        <footer aria-label="PedeAqui — Seu pedido começa aqui" style={{ color: "#8a837b", fontSize: 12, marginTop: 36, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <PedeAquiLogo size="xs" decorative />
          <span>Seu pedido começa aqui.</span>
        </footer>
      </div>
    </main>
  );
}

const modePill: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 999,
  background: "#f4efe9",
  color: "#514b45",
  fontWeight: 700,
};
