import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { pauseOrdersAction, resumeOrdersAction, saveMenuSettingsAction } from "@/features/menu/actions";
import { PublicMenuLinkCard } from "@/features/menu/public-menu-link-card";
import { PublicMenuLinkService } from "@/server/menu/public-menu-link-service";
import { StoreMenuService } from "@/server/menu/store-menu-service";
import { formatCents } from "@/server/catalog/money";

export default async function MenuSettingsPage() {
  const [settings, store] = await Promise.all([
    StoreMenuService.getSettings(),
    PublicMenuLinkService.getCurrentStore(),
  ]);
  const publicMenuUrl = PublicMenuLinkService.buildUrl(store.slug);

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 900 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Cardápio digital</h1>
        <p className="muted" style={{ margin: 0 }}>Identidade, canais e disponibilidade pública da unidade atual.</p>
      </header>

      <PublicMenuLinkCard url={publicMenuUrl} storeName={store.name} />

      <article className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <strong>Recebimento de pedidos</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {settings.accepting_orders ? "Recebendo normalmente" : `Pausado${settings.pause_reason ? ` — ${settings.pause_reason}` : ""}`}
            </p>
          </div>
          {settings.accepting_orders ? (
            <form action={pauseOrdersAction} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <Input label="Motivo da pausa" name="reason" placeholder="Ex.: muita demanda" />
              <Button tone="danger" type="submit">Pausar pedidos</Button>
            </form>
          ) : (
            <form action={resumeOrdersAction}><Button type="submit">Retomar pedidos</Button></form>
          )}
        </div>
      </article>

      <form action={saveMenuSettingsAction} className="card" style={{ padding: 20, display: "grid", gap: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Aparência e publicação</h2>
          <p className="muted">PedeAqui usa laranja + grafite como padrão. Cada loja pode ajustar apenas a cor principal.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <Input label="Cor principal" name="primaryColor" defaultValue={settings.primary_color} pattern="#[0-9A-Fa-f]{6}" />
          <Input label="Pedido mínimo" name="minimumOrder" defaultValue={(settings.minimum_order_cents / 100).toFixed(2).replace(".", ",")} hint={`Atual: ${formatCents(settings.minimum_order_cents)}`} inputMode="decimal" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <ImageUploadField name="logoFile" removeName="removeLogo" label="Logo do restaurante" currentUrl={settings.logo_url} />
          <ImageUploadField name="coverFile" removeName="removeCover" label="Capa do cardápio" currentUrl={settings.cover_url} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {[
            ["active", "Cardápio publicado", settings.active],
            ["showSearch", "Mostrar busca", settings.show_search],
            ["showCategories", "Mostrar categorias", settings.show_categories],
            ["showProductImages", "Mostrar imagens", settings.show_product_images],
            ["allowDelivery", "Permitir entrega", settings.allow_delivery],
            ["allowPickup", "Permitir retirada", settings.allow_pickup],
          ].map(([name, label, checked]) => (
            <label key={String(name)} className="card" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center", background: "var(--surface-2)" }}>
              <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
              <span>{String(label)}</span>
            </label>
          ))}
        </div>

        <div><Button type="submit">Salvar configurações</Button></div>
      </form>
    </section>
  );
}
