"use client";

import { useState } from "react";
import type { WhatsAppAutomationPreset } from "@/server/conversations/order-notification-model";

type Defaults = {
  notifyOrderReceived: boolean;
  notifyOrderConfirmed: boolean;
  notifyProductionPreparing: boolean;
  notifyPaymentPaid: boolean;
  notifyPickupReady: boolean;
  notifyPickupCompleted: boolean;
  notifyOutForDelivery: boolean;
  notifyDelivered: boolean;
};

type Props = {
  connected: boolean;
  enabled: boolean;
  preset: WhatsAppAutomationPreset;
  productionAvailable: boolean;
  deliveriesAvailable: boolean;
  defaults: Defaults;
};

const boxStyle = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
} as const;

export function WhatsAppAutomationSettings({ connected, enabled, preset: initialPreset, productionAvailable, deliveriesAvailable, defaults }: Props) {
  const [preset, setPreset] = useState<WhatsAppAutomationPreset>(initialPreset);
  const custom = preset === "custom";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700 }}>
        <input type="checkbox" name="orderNotificationsEnabled" defaultChecked={enabled} disabled={!connected} />
        <span>Enviar atualizações do pedido pelo WhatsApp</span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 9 }}>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="radio" name="orderNotificationPreset" value="simple" checked={preset === "simple"} onChange={() => setPreset("simple")} disabled={!connected} />
            Simples
          </span>
          <span className="muted" style={{ fontSize: 12 }}>Menos mensagens: recebido e o aviso principal de retirada ou entrega.</span>
        </label>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="radio" name="orderNotificationPreset" value="complete" checked={preset === "complete"} onChange={() => setPreset("complete")} disabled={!connected} />
            Completo
          </span>
          <span className="muted" style={{ fontSize: 12 }}>Acompanha todas as etapas disponíveis no PedeAqui para esta unidade.</span>
        </label>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="radio" name="orderNotificationPreset" value="custom" checked={preset === "custom"} onChange={() => setPreset("custom")} disabled={!connected} />
            Personalizado
          </span>
          <span className="muted" style={{ fontSize: 12 }}>O restaurante escolhe exatamente quais etapas deseja avisar.</span>
        </label>
      </div>

      <div style={{ ...boxStyle, opacity: custom ? 1 : 0.7 }}>
        <strong>Etapas do fluxo</strong>
        {!custom ? <span className="muted" style={{ fontSize: 12 }}>O PedeAqui define estas etapas pelo perfil escolhido. Selecione Personalizado para escolher uma a uma.</span> : null}
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="notifyOrderReceived" defaultChecked={defaults.notifyOrderReceived} disabled={!connected || !custom} /><span>Pedido recebido + link de acompanhamento</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="notifyOrderConfirmed" defaultChecked={defaults.notifyOrderConfirmed} disabled={!connected || !custom} /><span>Pedido confirmado</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }} title={productionAvailable ? undefined : "Disponível quando o módulo Produção estiver ativo"}><input type="checkbox" name="notifyProductionPreparing" defaultChecked={defaults.notifyProductionPreparing} disabled={!connected || !custom || !productionAvailable} /><span>Pedido em preparo {!productionAvailable ? "(módulo Produção inativo)" : ""}</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="notifyPaymentPaid" defaultChecked={defaults.notifyPaymentPaid} disabled={!connected || !custom} /><span>Pagamento confirmado</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }} title={productionAvailable ? undefined : "Disponível quando o módulo Produção estiver ativo"}><input type="checkbox" name="notifyPickupReady" defaultChecked={defaults.notifyPickupReady} disabled={!connected || !custom || !productionAvailable} /><span>Pronto para retirada {!productionAvailable ? "(módulo Produção inativo)" : ""}</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="notifyPickupCompleted" defaultChecked={defaults.notifyPickupCompleted} disabled={!connected || !custom} /><span>Pedido retirado pelo cliente</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }} title={deliveriesAvailable ? undefined : "Disponível quando o módulo Entregas estiver ativo"}><input type="checkbox" name="notifyOutForDelivery" defaultChecked={defaults.notifyOutForDelivery} disabled={!connected || !custom || !deliveriesAvailable} /><span>Saiu para entrega {!deliveriesAvailable ? "(módulo Entregas inativo)" : ""}</span></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }} title={deliveriesAvailable ? undefined : "Disponível quando o módulo Entregas estiver ativo"}><input type="checkbox" name="notifyDelivered" defaultChecked={defaults.notifyDelivered} disabled={!connected || !custom || !deliveriesAvailable} /><span>Pedido entregue {!deliveriesAvailable ? "(módulo Entregas inativo)" : ""}</span></label>
      </div>
    </div>
  );
}
