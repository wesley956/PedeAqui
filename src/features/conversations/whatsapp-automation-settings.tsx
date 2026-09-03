"use client";

import { useState } from "react";
import type { OrderNotificationType, WhatsAppAutomationPreset } from "@/server/conversations/order-notification-model";
import {
  ORDER_NOTIFICATION_PLACEHOLDERS,
  defaultOrderNotificationText,
  renderOrderNotificationTextTemplate,
  validateOrderNotificationTextTemplate,
  type OrderNotificationTemplateMap,
} from "@/server/conversations/order-notification-template";
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
  notifyOrderCanceled: boolean;
};

type Props = {
  connected: boolean;
  enabled: boolean;
  preset: WhatsAppAutomationPreset;
  capabilities: Record<OrderNotificationType, WhatsAppAutomationCapability>;
  defaults: Defaults;
  customTemplates: OrderNotificationTemplateMap;
};

const boxStyle = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
} as const;

const textStyle = {
  minHeight: 86,
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  padding: "9px 10px",
  width: "100%",
  resize: "vertical" as const,
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
  { key: "order_canceled", name: "notifyOrderCanceled", defaultKey: "notifyOrderCanceled" },
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

const previewValues = {
  cliente: "Maria",
  restaurante: "Sua loja",
  pedido: "#123",
  status: "Atualização do pedido",
  link_cardapio: "https://pedeaqui.app/m/sua-loja",
  link_acompanhamento: "https://pedeaqui.app/m/sua-loja/pedido/123",
} as const;

export function WhatsAppAutomationSettings({ connected, enabled, preset: initialPreset, capabilities, defaults, customTemplates }: Props) {
  const [preset, setPreset] = useState<WhatsAppAutomationPreset>(initialPreset);
  const [texts, setTexts] = useState<OrderNotificationTemplateMap>(customTemplates);
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
          <span className="muted" style={{ fontSize: 12 }}>Menos mensagens: recebido, aviso principal de retirada/entrega e cancelamento.</span>
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

      <div style={{ ...boxStyle, opacity: custom ? 1 : 0.86 }}>
        <strong>Etapas do fluxo e textos</strong>
        {!custom ? <span className="muted" style={{ fontSize: 12 }}>O preset altera somente quais avisos ficam ligados. Os textos podem ser preparados sem ativar módulos, comprar plano ou ampliar permissões.</span> : null}
        <span className="muted" style={{ fontSize: 12 }}>O texto editado é usado apenas quando a Meta permite mensagem livre. Fora da janela de atendimento, o PedeAqui continua usando o modelo aprovado na Meta; editar aqui não altera nem contorna essa aprovação.</span>
        <div style={{ display: "grid", gap: 9 }}>
          {automationFields.map((field) => {
            const capability = capabilities[field.key];
            const disabledToggle = !custom || !capability.configurable;
            const text = texts[field.key] ?? defaultOrderNotificationText(field.key);
            const validation = validateOrderNotificationTextTemplate(text);
            const preview = renderOrderNotificationTextTemplate(text, { ...previewValues, status: capability.label });
            return (
              <div key={field.key} style={{ display: "grid", gap: 8, padding: "12px 0", borderTop: "1px solid var(--border)" }} title={capability.reason ?? undefined}>
                <label style={{ display: "grid", gap: 5 }}>
                  <span style={{ display: "flex", gap: 9, alignItems: "flex-start", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                      <input type="checkbox" name={field.name} defaultChecked={defaults[field.defaultKey]} disabled={disabledToggle} style={{ marginTop: 3 }} />
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

                <details style={{ marginLeft: 26 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Editar texto e visualizar prévia</summary>
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <textarea
                      name={`orderNotificationText_${field.key}`}
                      value={text}
                      disabled={!capability.configurable}
                      onChange={(event) => setTexts((current) => ({ ...current, [field.key]: event.target.value }))}
                      style={textStyle}
                    />
                    <span className="muted" style={{ fontSize: 11 }}>
                      Variáveis permitidas: {ORDER_NOTIFICATION_PLACEHOLDERS.map((placeholder) => `{${placeholder}}`).join(", ")}.
                    </span>
                    {!validation.ok ? <span style={{ fontSize: 11, fontWeight: 700 }}>{validation.message}</span> : null}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={!capability.configurable}
                        onClick={() => setTexts((current) => ({ ...current, [field.key]: defaultOrderNotificationText(field.key) }))}
                        style={{ minHeight: 44, padding: "8px 12px" }}
                      >
                        Restaurar texto padrão
                      </button>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, border: "1px dashed var(--border)" }}>
                      <strong style={{ fontSize: 11 }}>Prévia</strong>
                      <p style={{ margin: "5px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>{preview ?? "A prévia usa o texto padrão quando faltar uma variável real no pedido."}</p>
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
