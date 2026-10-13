import { Button } from "@/components/ui/button";
import { Input, Checkbox, SelectField } from "@/components/ui/form-controls";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import styles from "../settings-form.module.css";
import { createDeliveryNeighborhoodAction, removeDeliveryNeighborhoodAction, saveDeliverySettingsAction, toggleDeliveryNeighborhoodAction } from "@/features/delivery/actions";
import { updateDeliveryNeighborhoodAction } from "@/features/delivery/neighborhood-actions";
import { saveDriverHistoryVisibilityAction } from "@/features/delivery/driver-history-actions";
import { DeliveryService } from "@/server/delivery/delivery-service";
import { DriverHistoryPolicyService } from "@/server/delivery/driver-history-policy-service";
import { formatCents } from "@/server/catalog/money";
import { PageHeader } from "@/components/ui/page-header";

export default async function DeliverySettingsPage() {
  const [settings, neighborhoods, driverHistoryVisible] = await Promise.all([
    DeliveryService.getSettings(),
    DeliveryService.listNeighborhoods(),
    DriverHistoryPolicyService.get(),
  ]);

  return (
    <section className={styles.page}>
      <PageHeader title="Entrega" description="Regras padrão da unidade e taxas específicas por bairro." />

      <form action={saveDeliverySettingsAction} className={styles.form} aria-label="Regras da entrega">
        <div>
          <h2 style={{ margin: 0 }}>Configuração básica</h2>
          <p className="muted">Estas regras serão usadas pelo checkout e aparecem resumidas no cardápio público.</p>
        </div>

        <div className={styles.grid}>
          <SelectField id="delivery-fee-mode" label="Modo da taxa" name="feeMode" defaultValue={settings.fee_mode}>
            <option value="neighborhood">Por bairro</option>
            <option value="default">Taxa padrão</option>
          </SelectField>
          <Input label="Taxa padrão" name="defaultFee" inputMode="decimal" defaultValue={(settings.default_fee_cents / 100).toFixed(2).replace(".", ",")} />
          <Input label="Frete grátis acima de" name="freeDeliveryOver" inputMode="decimal" defaultValue={settings.free_delivery_over_cents === null ? "" : (settings.free_delivery_over_cents / 100).toFixed(2).replace(".", ",")} />
          <div role="note" className={styles.note}>
            <strong style={{ fontSize: "var(--font-size-sm)" }}>Cobertura validada por bairro</strong>
            <span className={styles.meta}>Cadastre os bairros atendidos para definir a cobertura e evitar pedidos fora da área de entrega.</span>
          </div>
          <Input label="Prazo mínimo (min)" name="estimatedMinMinutes" type="number" min={0} defaultValue={settings.estimated_min_minutes} />
          <Input label="Prazo máximo (min)" name="estimatedMaxMinutes" type="number" min={0} defaultValue={settings.estimated_max_minutes} />
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Checkbox id="delivery-enabled" name="enabled" label="Entrega ativa" defaultChecked={settings.enabled} />
          <Checkbox id="delivery-require-neighborhood" name="requireNeighborhoodMatch" label="Exigir bairro cadastrado" defaultChecked={settings.require_neighborhood_match} />
        </div>

        <div><Button type="submit">Salvar entrega</Button></div>
      </form>

      <details className={styles.details}>
        <summary>Portal do entregador</summary>
      <form action={saveDriverHistoryVisibilityAction} className={styles.form} aria-label="Histórico do entregador">
        <div>
          <h2 style={{ margin: 0 }}>Portal do entregador</h2>
          <p className="muted" style={{ marginBottom: 0 }}>A loja decide se entregadores podem consultar pedidos que já concluíram. Quando desativado, somente entregas ativas aparecem no portal.</p>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" name="driverHistoryVisible" defaultChecked={driverHistoryVisible} style={{ marginTop: 3 }} />
          <span><strong>Mostrar histórico de entregas concluídas ao entregador</strong><br /><span className={styles.meta}>O histórico continua disponível para o restaurante mesmo quando esta opção estiver desligada.</span></span>
        </label>
        <div><Button type="submit">Salvar acesso do entregador</Button></div>
      </form>
      </details>

      <div>
        <details className={styles.details}>
          <summary>Adicionar bairro</summary>
        <form action={createDeliveryNeighborhoodAction} className={styles.form} aria-label="Adicionar bairro">
          <Input id="new-neighborhood-neighborhoodName" label="Bairro" name="neighborhoodName" required />
          <div className={styles.grid}>
            <Input id="new-neighborhood-city" label="Cidade" name="city" required />
            <Input id="new-neighborhood-state" label="UF" name="state" maxLength={2} placeholder="SP" required />
          </div>
          <Input id="new-neighborhood-fee" label="Taxa" name="fee" inputMode="decimal" placeholder="5,00" required />
          <Input id="new-neighborhood-minimumOrder" label="Pedido mínimo do bairro" name="minimumOrder" inputMode="decimal" hint="Opcional; prevalece na cotação deste bairro." />
          <Input id="new-neighborhood-additionalMinutes" label="Minutos adicionais" name="additionalMinutes" type="number" min={0} defaultValue={0} hint="Somados ao prazo padrão da loja." />
          <Button type="submit">Adicionar bairro</Button>
        </form>
        </details>

        <h2 style={{ fontSize: "var(--font-size-lg)", margin: "16px 0 12px" }}>Bairros e taxas</h2>
        <div className={styles.list}>
          {neighborhoods.length === 0 ? (
            <div className={styles.empty}>
              <strong>Nenhum bairro cadastrado</strong>
              <p className="muted" style={{ marginBottom: 0 }}>Se “Exigir bairro cadastrado” estiver ativo, o checkout bloqueará endereços fora desta lista.</p>
            </div>
          ) : neighborhoods.map((row) => (
            <article key={row.id} className={styles.row}>
              <div className={styles.rowTop}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{row.neighborhood_name}</strong>
                    <span className={styles.badge} data-active={row.active}>{row.active ? "Ativo" : "Pausado"}</span>
                  </div>
                  <div className={styles.meta}>{row.city}/{row.state}</div>
                </div>
                <strong>{formatCents(row.fee_cents)}</strong>
              </div>
              <div className={styles.meta}>
                {row.minimum_order_cents !== null ? `Mínimo ${formatCents(row.minimum_order_cents)} · ` : ""}
                {row.additional_minutes > 0 ? `+${row.additional_minutes} min` : "Prazo padrão"}
              </div>

              <details className={styles.details}>
                <summary>Editar bairro</summary>
                <form action={updateDeliveryNeighborhoodAction} className={styles.form} aria-label={`Editar bairro ${row.neighborhood_name}`}>
                  <input type="hidden" name="neighborhoodId" value={row.id} />
                  <Input id={`neighborhood-${row.id}-neighborhoodName`} label="Bairro" name="neighborhoodName" defaultValue={row.neighborhood_name} required />
                  <div className={styles.grid}>
                    <Input id={`neighborhood-${row.id}-city`} label="Cidade" name="city" defaultValue={row.city} required />
                    <Input id={`neighborhood-${row.id}-state`} label="UF" name="state" maxLength={2} defaultValue={row.state} required />
                  </div>
                  <Input id={`neighborhood-${row.id}-fee`} label="Taxa" name="fee" inputMode="decimal" defaultValue={(row.fee_cents / 100).toFixed(2).replace(".", ",")} required />
                  <Input id={`neighborhood-${row.id}-minimumOrder`} label="Pedido mínimo do bairro" name="minimumOrder" inputMode="decimal" defaultValue={row.minimum_order_cents === null ? "" : (row.minimum_order_cents / 100).toFixed(2).replace(".", ",")} hint="Opcional; prevalece na cotação deste bairro." />
                  <Input id={`neighborhood-${row.id}-additionalMinutes`} label="Minutos adicionais" name="additionalMinutes" type="number" min={0} defaultValue={row.additional_minutes} hint="Somados ao prazo padrão da loja." />
                  <div><Button type="submit" loadingLabel="Salvando bairro…">Salvar bairro</Button></div>
                </form>
              </details>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <form action={toggleDeliveryNeighborhoodAction}>
                  <input type="hidden" name="neighborhoodId" value={row.id} />
                  <input type="hidden" name="active" value={row.active ? "false" : "true"} />
                  <Button tone="secondary" type="submit">{row.active ? "Pausar" : "Ativar"}</Button>
                </form>
                <form action={removeDeliveryNeighborhoodAction}>
                  <input type="hidden" name="neighborhoodId" value={row.id} />
                  <ConfirmSubmitButton tone="secondary" size="md" confirmation={`Remover o bairro ${row.neighborhood_name} da área de entrega?`}>Remover bairro</ConfirmSubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
