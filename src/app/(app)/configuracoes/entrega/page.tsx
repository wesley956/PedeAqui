import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDeliveryNeighborhoodAction, removeDeliveryNeighborhoodAction, saveDeliverySettingsAction, toggleDeliveryNeighborhoodAction } from "@/features/delivery/actions";
import { updateDeliveryNeighborhoodAction } from "@/features/delivery/neighborhood-actions";
import { saveDriverHistoryVisibilityAction } from "@/features/delivery/driver-history-actions";
import { DeliveryService } from "@/server/delivery/delivery-service";
import { DriverHistoryPolicyService } from "@/server/delivery/driver-history-policy-service";
import { formatCents } from "@/server/catalog/money";

export default async function DeliverySettingsPage() {
  const [settings, neighborhoods, driverHistoryVisible] = await Promise.all([
    DeliveryService.getSettings(),
    DeliveryService.listNeighborhoods(),
    DriverHistoryPolicyService.get(),
  ]);

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 980 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Entrega</h1>
        <p className="muted" style={{ margin: 0 }}>Regras padrão da unidade e taxas específicas por bairro.</p>
      </header>

      <form action={saveDeliverySettingsAction} className="card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Configuração básica</h2>
          <p className="muted">Estas regras serão usadas pelo checkout e aparecem resumidas no cardápio público.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Modo da taxa</strong>
            <select name="feeMode" defaultValue={settings.fee_mode} style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "10px 12px" }}>
              <option value="neighborhood">Por bairro</option>
              <option value="default">Taxa padrão</option>
            </select>
          </label>
          <Input label="Taxa padrão" name="defaultFee" inputMode="decimal" defaultValue={(settings.default_fee_cents / 100).toFixed(2).replace(".", ",")} />
          <Input label="Frete grátis acima de" name="freeDeliveryOver" inputMode="decimal" defaultValue={settings.free_delivery_over_cents === null ? "" : (settings.free_delivery_over_cents / 100).toFixed(2).replace(".", ",")} />
          <div role="note" style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong style={{ fontSize: 14 }}>Cobertura validada por bairro</strong>
            <span className="muted" style={{ fontSize: 12 }}>O checkout não usa distância sem geocodificação. Cadastre os bairros atendidos para não aceitar um endereço fora da área.</span>
          </div>
          <Input label="Prazo mínimo (min)" name="estimatedMinMinutes" type="number" min={0} defaultValue={settings.estimated_min_minutes} />
          <Input label="Prazo máximo (min)" name="estimatedMaxMinutes" type="number" min={0} defaultValue={settings.estimated_max_minutes} />
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Entrega ativa</label>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="requireNeighborhoodMatch" defaultChecked={settings.require_neighborhood_match} /> Exigir bairro cadastrado</label>
        </div>

        <div><Button type="submit">Salvar entrega</Button></div>
      </form>

      <form action={saveDriverHistoryVisibilityAction} className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>Portal do entregador</h2>
          <p className="muted" style={{ marginBottom: 0 }}>A loja decide se entregadores podem consultar pedidos que já concluíram. Quando desativado, somente entregas ativas aparecem no portal.</p>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" name="driverHistoryVisible" defaultChecked={driverHistoryVisible} style={{ marginTop: 3 }} />
          <span><strong>Mostrar histórico de entregas concluídas ao entregador</strong><br /><span className="muted" style={{ fontSize: 12 }}>O histórico continua disponível para o restaurante mesmo quando esta opção estiver desligada.</span></span>
        </label>
        <div><Button type="submit">Salvar acesso do entregador</Button></div>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 390px) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <form action={createDeliveryNeighborhoodAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Adicionar bairro</h2>
          <Input label="Bairro" name="neighborhoodName" required />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
            <Input label="Cidade" name="city" required />
            <Input label="UF" name="state" maxLength={2} placeholder="SP" required />
          </div>
          <Input label="Taxa" name="fee" inputMode="decimal" placeholder="5,00" required />
          <Input label="Pedido mínimo do bairro" name="minimumOrder" inputMode="decimal" hint="Opcional; prevalece na cotação deste bairro." />
          <Input label="Minutos adicionais" name="additionalMinutes" type="number" min={0} defaultValue={0} hint="Somados ao prazo padrão da loja." />
          <Button type="submit">Adicionar bairro</Button>
        </form>

        <div className="card" style={{ overflow: "hidden" }}>
          {neighborhoods.length === 0 ? (
            <div style={{ padding: 24 }}>
              <strong>Nenhum bairro cadastrado</strong>
              <p className="muted" style={{ marginBottom: 0 }}>Se “Exigir bairro cadastrado” estiver ativo, o checkout bloqueará endereços fora desta lista.</p>
            </div>
          ) : neighborhoods.map((row) => (
            <article key={row.id} style={{ padding: 15, borderBottom: "1px solid var(--border)", display: "grid", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{row.neighborhood_name}</strong>
                    <span style={{ fontSize: 10, fontWeight: 900, color: row.active ? "var(--success)" : "var(--muted)" }}>{row.active ? "ATIVO" : "PAUSADO"}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{row.city}/{row.state}</div>
                </div>
                <strong style={{ color: "var(--accent)" }}>{formatCents(row.fee_cents)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {row.minimum_order_cents !== null ? `Mínimo ${formatCents(row.minimum_order_cents)} · ` : ""}
                {row.additional_minutes > 0 ? `+${row.additional_minutes} min` : "Prazo padrão"}
              </div>

              <details style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0 10px" }}>
                <summary style={{ cursor: "pointer", padding: "10px 2px", fontWeight: 800, fontSize: 13 }}>Editar bairro</summary>
                <form action={updateDeliveryNeighborhoodAction} style={{ display: "grid", gap: 10, padding: "2px 0 12px" }}>
                  <input type="hidden" name="neighborhoodId" value={row.id} />
                  <Input label="Bairro" name="neighborhoodName" defaultValue={row.neighborhood_name} required />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
                    <Input label="Cidade" name="city" defaultValue={row.city} required />
                    <Input label="UF" name="state" maxLength={2} defaultValue={row.state} required />
                  </div>
                  <Input label="Taxa" name="fee" inputMode="decimal" defaultValue={(row.fee_cents / 100).toFixed(2).replace(".", ",")} required />
                  <Input label="Pedido mínimo do bairro" name="minimumOrder" inputMode="decimal" defaultValue={row.minimum_order_cents === null ? "" : (row.minimum_order_cents / 100).toFixed(2).replace(".", ",")} hint="Opcional; prevalece na cotação deste bairro." />
                  <Input label="Minutos adicionais" name="additionalMinutes" type="number" min={0} defaultValue={row.additional_minutes} hint="Somados ao prazo padrão da loja." />
                  <div><Button type="submit">Salvar alterações</Button></div>
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
                  <Button tone="danger" type="submit">Remover</Button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
