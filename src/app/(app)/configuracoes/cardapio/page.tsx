import { Button } from "@/components/ui/button";
import { Input, Checkbox } from "@/components/ui/form-controls";
import { FormDisclosure } from "@/components/ui/form-disclosure";
import styles from "../settings-form.module.css";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { pauseOrdersAction, resumeOrdersAction, saveMenuSettingsAction } from "@/features/menu/actions";
import { StoreMenuService } from "@/server/menu/store-menu-service";
import { formatCents } from "@/server/catalog/money";
import { PageHeader } from "@/components/ui/page-header";

export default async function MenuSettingsPage() {
  const settings = await StoreMenuService.getSettings();

  return (
    <section className={styles.page}>
      <PageHeader title="Cardápio digital" description="Identidade, canais e disponibilidade pública da unidade atual." />

      <article className={styles.card}>
        <div className={styles.rowTop}>
          <div>
            <strong>Recebimento de pedidos</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {settings.accepting_orders ? "Recebendo normalmente" : `Pausado${settings.pause_reason ? ` — ${settings.pause_reason}` : ""}`}
            </p>
          </div>
          {settings.accepting_orders ? (
            <form action={pauseOrdersAction} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <Input label="Motivo da pausa" name="reason" placeholder="Ex.: muita demanda" />
              <Button tone="secondary" type="submit">Pausar pedidos</Button>
            </form>
          ) : (
            <form action={resumeOrdersAction}><Button type="submit">Retomar pedidos</Button></form>
          )}
        </div>
      </article>

      <form action={saveMenuSettingsAction} className={styles.form} aria-label="Aparência e publicação do cardápio">
        <div>
          <h2 style={{ margin: 0 }}>Aparência e publicação</h2>
          <p className="muted">PedeAqui usa laranja + grafite como padrão. Cada loja pode ajustar apenas a cor principal.</p>
        </div>

        <div className={styles.grid}>
          <Input label="Cor principal" name="primaryColor" defaultValue={settings.primary_color} pattern="#[0-9A-Fa-f]{6}" />
          <Input label="Pedido mínimo" name="minimumOrder" defaultValue={(settings.minimum_order_cents / 100).toFixed(2).replace(".", ",")} hint={`Atual: ${formatCents(settings.minimum_order_cents)}`} inputMode="decimal" />
        </div>

        <FormDisclosure className={styles.details} summary="Logo e capa do cardápio">
        <div className={styles.grid}>
          <ImageUploadField name="logoFile" removeName="removeLogo" label="Logo do restaurante" currentUrl={settings.logo_url} />
          <ImageUploadField name="coverFile" removeName="removeCover" label="Capa do cardápio" currentUrl={settings.cover_url} />
        </div>
        </FormDisclosure>

        <div className={styles.grid}>
          {[
            ["active", "Cardápio publicado", settings.active],
            ["showSearch", "Mostrar busca", settings.show_search],
            ["showCategories", "Mostrar categorias", settings.show_categories],
            ["showProductImages", "Mostrar imagens", settings.show_product_images],
            ["allowDelivery", "Permitir entrega", settings.allow_delivery],
            ["allowPickup", "Permitir retirada", settings.allow_pickup],
          ].map(([name, label, checked]) => (
            <Checkbox key={String(name)} id={`menu-${name}`} name={String(name)} label={String(label)} defaultChecked={Boolean(checked)} />
          ))}
        </div>

        <div className={styles.stickyActions}><Button type="submit" loadingLabel="Salvando cardápio…">Salvar configurações</Button></div>
      </form>
    </section>
  );
}
