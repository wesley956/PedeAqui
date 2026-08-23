import { saveOperationalSettingsAction } from "@/features/platform/operational-settings-actions";
import type { OperationalSettings } from "@/server/stores/operational-settings-service";
import styles from "@/app/platform/platform.module.css";

export function OperationalSettingsForm({ organizationId, storeId, settings, modules }: {
  organizationId: string;
  storeId: string;
  settings: OperationalSettings;
  modules: Set<string>;
}) {
  const trackingAvailable = modules.has("deliveries") && modules.has("driver");
  const campaignsAvailable = modules.has("growth") && modules.has("customers") && modules.has("conversations");
  return <form action={saveOperationalSettingsAction} className={styles.supportCard}>
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="storeId" value={storeId} />
    <strong>Comportamento dos módulos</strong>
    <label><input type="checkbox" name="ordersAutoAccept" defaultChecked={settings.ordersAutoAccept} /> Autoaceitar pedidos elegíveis</label>
    <label>Board de Pedidos<select name="ordersWorkflowMode" defaultValue={settings.ordersWorkflowMode}><option value="standard">Completo (legado)</option><option value="simplified">Simplificado — 3 etapas</option></select></label>
    <label><input type="checkbox" name="deliveriesAutoCreateWhenReady" defaultChecked={settings.deliveriesAutoCreateWhenReady} /> Enviar delivery pronto para Entregas</label>
    <label title={trackingAvailable ? undefined : "Ative Entregas e Meu roteiro primeiro"}><input type="checkbox" name="deliveriesDriverTrackingEnabled" defaultChecked={settings.deliveriesDriverTrackingEnabled} disabled={!trackingAvailable} /> Rastreamento durante rota ativa</label>
    <label>Alerta de possível parada (min)<input type="number" name="deliveriesStationaryAlertMinutes" min={5} max={120} defaultValue={settings.deliveriesStationaryAlertMinutes} /></label>
    <label>Retenção da rota (dias)<input type="number" name="deliveriesTrackingRetentionDays" min={1} max={30} defaultValue={settings.deliveriesTrackingRetentionDays} /></label>
    <label title={campaignsAvailable ? undefined : "Ative Growth, Clientes e Conversas primeiro"}><input type="checkbox" name="growthCampaignsEnabled" defaultChecked={settings.growthCampaignsEnabled} disabled={!campaignsAvailable} /> Campanhas promocionais oficiais</label>
    <label>Limite de campanha por minuto<input type="number" name="campaignRatePerMinute" min={1} max={60} defaultValue={settings.campaignRatePerMinute} /></label>
    <label>Motivo da alteração<input name="reason" required minLength={5} maxLength={500} placeholder="Ex.: homologação do fluxo simplificado" /></label>
    <label>Protocolo<input name="requestId" required minLength={3} maxLength={120} placeholder="Ex.: C01-HOMOLOG-001" /></label>
    <button className={styles.button} type="submit">Salvar configurações operacionais</button>
    <small>Desligar uma opção restaura o fluxo padrão sem apagar históricos. Tracking só coleta durante rota ativa; campanhas exigem consentimento.</small>
  </form>;
}
