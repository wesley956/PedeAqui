import { saveOperationalSettingsAction } from "@/features/platform/operational-settings-actions";
import type { OperationalSettings } from "@/server/stores/operational-settings-service";
import styles from "@/app/platform/platform.module.css";

const groupStyle = {
  display: "grid",
  gap: 10,
  margin: 0,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

const labelStyle = { display: "grid", gap: 5, color: "var(--text)", fontSize: 12 } as const;
const checkStyle = { display: "flex", gap: 8, alignItems: "center", color: "var(--text)", fontSize: 12 } as const;

export function OperationalSettingsForm({ organizationId, storeId, settings, modules }: {
  organizationId: string;
  storeId: string;
  settings: OperationalSettings;
  modules: Set<string>;
}) {
  const trackingAvailable = modules.has("deliveries") && modules.has("driver");
  const campaignsAvailable = modules.has("growth") && modules.has("customers") && modules.has("conversations");

  return <form action={saveOperationalSettingsAction} className={styles.supportCard} style={{ gap: 14 }}>
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="storeId" value={storeId} />
    <strong>Comportamento dos módulos</strong>
    <span>Configure apenas como os módulos já habilitados funcionam nesta unidade. Alterar estas opções não ativa módulos novos.</span>

    <fieldset style={groupStyle}>
      <legend style={{ padding: "0 5px", fontWeight: 900 }}>Pedidos</legend>
      <label style={checkStyle}>
        <input type="checkbox" name="ordersAutoAccept" defaultChecked={settings.ordersAutoAccept} />
        Autoaceitar pedidos elegíveis
      </label>
      <label style={labelStyle}>
        Board de Pedidos
        <select className={styles.field} name="ordersWorkflowMode" defaultValue={settings.ordersWorkflowMode}>
          <option value="standard">Completo — aceite e etapas padrão</option>
          <option value="simplified">Simplificado — 3 etapas: Iniciar, Pronto e Finalizados</option>
        </select>
      </label>
      <small>O fluxo simplificado exige autoaceite para não criar uma etapa invisível de confirmação.</small>
    </fieldset>

    <fieldset style={groupStyle}>
      <legend style={{ padding: "0 5px", fontWeight: 900 }}>Entregas</legend>
      <label style={checkStyle}>
        <input type="checkbox" name="deliveriesAutoCreateWhenReady" defaultChecked={settings.deliveriesAutoCreateWhenReady} />
        Enviar delivery pronto automaticamente para Entregas
      </label>
      <label style={checkStyle} title={trackingAvailable ? undefined : "Ative os módulos Entregas e Entregador para usar rastreamento"}>
        <input type="checkbox" name="deliveriesDriverTrackingEnabled" defaultChecked={settings.deliveriesDriverTrackingEnabled} disabled={!trackingAvailable} />
        Rastreamento do entregador durante rota ativa
      </label>
      {!trackingAvailable ? <small>Rastreamento indisponível enquanto o módulo Entregador estiver desligado.</small> : null}
      <label style={labelStyle}>
        Alerta de possível parada (minutos)
        <input className={styles.field} type="number" name="deliveriesStationaryAlertMinutes" min={5} max={120} defaultValue={settings.deliveriesStationaryAlertMinutes} />
      </label>
      <label style={labelStyle}>
        Retenção da rota (dias)
        <input className={styles.field} type="number" name="deliveriesTrackingRetentionDays" min={1} max={30} defaultValue={settings.deliveriesTrackingRetentionDays} />
      </label>
    </fieldset>

    <fieldset style={groupStyle}>
      <legend style={{ padding: "0 5px", fontWeight: 900 }}>Marketing e campanhas</legend>
      <label style={checkStyle} title={campaignsAvailable ? undefined : "Ative Growth, Clientes e Conversas para usar campanhas"}>
        <input type="checkbox" name="growthCampaignsEnabled" defaultChecked={settings.growthCampaignsEnabled} disabled={!campaignsAvailable} />
        Campanhas promocionais oficiais
      </label>
      {!campaignsAvailable ? <small>Campanhas indisponíveis enquanto o módulo Growth ou alguma dependência estiver desligada.</small> : null}
      <label style={labelStyle}>
        Limite de campanha por minuto
        <input className={styles.field} type="number" name="campaignRatePerMinute" min={1} max={60} defaultValue={settings.campaignRatePerMinute} />
      </label>
    </fieldset>

    <fieldset style={groupStyle}>
      <legend style={{ padding: "0 5px", fontWeight: 900 }}>Registro da alteração</legend>
      <label style={labelStyle}>
        Motivo da alteração
        <input className={styles.field} name="reason" required minLength={5} maxLength={500} placeholder="Ex.: operação simplificada solicitada pelo cliente" />
      </label>
      <label style={labelStyle}>
        Protocolo
        <input className={styles.field} name="requestId" required minLength={3} maxLength={120} placeholder="Ex.: CLIENTE-01-OPERACAO" />
      </label>
    </fieldset>

    <button className={styles.button} type="submit">Salvar configurações operacionais</button>
    <small>Desligar uma opção restaura o fluxo padrão sem apagar históricos. Tracking só coleta durante rota ativa; campanhas exigem consentimento.</small>
  </form>;
}
