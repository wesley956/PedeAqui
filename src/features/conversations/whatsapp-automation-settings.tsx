"use client";

import { useState } from "react";
import type { OrderNotificationType, WhatsAppAutomationPreset } from "@/server/conversations/order-notification-model";
import type { WhatsAppAutomationCapability } from "@/server/conversations/whatsapp-automation-capability";

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
  capabilities: Record<OrderNotificationType, WhatsAppAutomationCapability>;
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

const automationFields: Array<{
  key: OrderNotificationType;
  name: string;
  defaultKey: keyof Defaults;
}> = [
  { key: "order_received", name: "notifyOrderReceived", defaultKey: "notifyOrderReceived" },
  { key: "order_confirmed", name: "notifyOrderConfirmed", defaultKey: "notifyOrderConfirmed" },
  { key: "production_preparing", name: "notifyProductionPreparing", defaultKey: "notifyProductionPreparing" },
  { key: "payment_paid", name: "notifyPaymentPaid", defaultKey: "notifyPaymentPaid" },
  { key: "pickup_ready", name: "notifyPickupReady", defaultKey: "notifyPickupReady" },
  { key: "pickup_completed", name: "notifyPickupCompleted", defaultKey: "notifyPickupCompleted" },
  { key: "out_for_delivery", name: "notifyOutForDelivery", defaultKey: "notifyOutForDelivery" },
  { key: "delivered", name: "notifyDelivered", defaultKey: "notifyDelivered" },
];

const stateLabel: Record<WhatsAppAutomationCapability["state"], string> = {
  enabled: "Ativa",
  available_disabled: "Desativada",
  suspended_module: "Suspensa por operação",
  suspended_entitlement: "Suspensa pelo plano",
  suspended_channel: "Suspensa pelo WhatsApp",
  unavailable_profile: "Indisponível para este perfil",
  invalid_configuration: "Configuração necessária",
};

export function WhatsAppAutomationSettings({ connected, enabled, preset: initialPreset, capabilities, defaults }: Props) {
  const [preset, setPreset] = useState<WhatsAppAutomationPreset>(initialPreset);
  const custom = preset === "custom";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700 }}>
        <input type="checkbox" name="orderNotificationsEnabled" defaultChecked={enabled} disabled={!connected} />
        <span>Enviar atualizações do pedido pelo WhatsApp</span>
      </label>
      {!connected ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Você pode preparar as preferências abaixo agora. O envio só poderá ser ativado depois que o WhatsApp estiver conectado.</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 9 }}>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="radio" name="orderNotificationPreset" value="simple" checked={preset === "simple"} onChange={() => setPreset("simple")} />
            Simples
          </span>
          <span className="muted" style={{ fontSize: 12 }}>Menos mensagens: recebido e o aviso principal de retirada ou entrega.</span>
        </label>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="radio" name="orderNotificationPreset" value="complete" checked={preset === "complete"} onChange={() => setPreset("complete")} />
            Completo
          </span>
          <span className="muted" style={{ fontSize: 12 }}>Seleciona todas as etapas, mas nenhuma delas ignora módulo, plano, operação ou saúde do canal.</span>
        </label>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="radio" name="orderNotificationPreset" value="custom" checked={preset === "custom"} onChange={() => setPreset("custom")} />
            Personalizado
          </span>
          <span className="muted" style={{ fontSize: 12 }}>A unidade escolhe individualmente quais etapas elegíveis deseja comunicar.</span>
        </label>
      </div>

      <div style={{ ...boxStyle, opacity: custom ? 1 : 0.82 }}>
        <strong>Etapas do fluxo</strong>
        {!custom ? <span className="muted" style={{ fontSize: 12 }}>O preset altera somente preferências de comunicação. Ele não ativa módulos, não compra plano e não amplia permissões.</span> : null}
        <div style={{ display: "grid", gap: 9 }}>
          {automationFields.map((field) => {
            const capability = capabilities[field.key];
            const disabled = !custom || !capability.configurable;
            return (
              <label key={field.key} style={{ display: "grid", gap: 5, padding: "10px 0", borderTop: "1px solid var(--border)" }} title={capability.reason ?? undefined}>
                <span style={{ display: "flex", gap: 9, alignItems: "flex-start", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <input type="checkbox" name={field.name} defaultChecked={defaults[field.defaultKey]} disabled={disabled} style={{ marginTop: 3 }} />
                    <span>
                      <strong>{capability.label}</strong>
                      <span className="muted" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{capability.description}</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{stateLabel[capability.state]}</span>
                </span>
                <span className="muted" style={{ fontSize: 11, paddingLeft: 26 }}>Gatilho: {capability.triggerLabel}</span>
                {capability.dependencyLabel ? <span className="muted" style={{ fontSize: 11, paddingLeft: 26 }}>Depende de: {capability.dependencyLabel}</span> : null}
                {capability.reason ? <span style={{ fontSize: 11, paddingLeft: 26, fontWeight: 700 }}>{capability.reason}</span> : null}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
