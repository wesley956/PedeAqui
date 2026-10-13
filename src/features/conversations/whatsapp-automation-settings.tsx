"use client";

import { FormDisclosure } from "@/components/ui/form-disclosure";
import styles from "./automation-settings.module.css";

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
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
} as const;

const textStyle = {
  minHeight: 86,
  borderRadius: "var(--radius-sm)",
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
  unavailable_workflow: "Oculta no fluxo de pedidos",
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

const trackingPlaceholder = "{link_acompanhamento}";

function initialMessageHasTrackingLink(templates: OrderNotificationTemplateMap) {
  return (templates.order_received ?? defaultOrderNotificationText("order_received")).includes(trackingPlaceholder);
}

function withInitialTrackingLink(text: string) {
  if (text.includes(trackingPlaceholder)) return text;
  return `${text.trimEnd()}\nAcompanhe seu pedido: ${trackingPlaceholder}`;
}

function withoutInitialTrackingLink(text: string) {
  const defaultWithLink = defaultOrderNotificationText("order_received");
  if (text === defaultWithLink) return "{restaurante}: recebemos seu pedido {pedido}.";
  return text
    .replace(/\s*Acompanhe(?:\s+seu\s+pedido)?(?:\s+por\s+aqui)?\s*:\s*\{link_acompanhamento\}\.?/gi, "")
    .replaceAll(trackingPlaceholder, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function WhatsAppAutomationSettings({ connected, enabled, preset: initialPreset, capabilities, defaults, customTemplates }: Props) {
  const [preset, setPreset] = useState<WhatsAppAutomationPreset>(initialPreset);
  const [texts, setTexts] = useState<OrderNotificationTemplateMap>(customTemplates);
  const custom = preset === "custom";
  const includeInitialTrackingLink = initialMessageHasTrackingLink(texts);

  function setInitialTrackingLink(enabledValue: boolean) {
    setTexts((current) => {
      const currentText = current.order_received ?? defaultOrderNotificationText("order_received");
      const nextText = enabledValue ? withInitialTrackingLink(currentText) : withoutInitialTrackingLink(currentText);
      return { ...current, order_received: nextText };
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: "var(--font-weight-bold)" }}>
        <input type="checkbox" name="orderNotificationsEnabled" defaultChecked={enabled} disabled={!connected} />
        <span>Enviar atualizações do pedido pelo WhatsApp</span>
      </label>
      {!connected ? <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Você pode preparar as preferências abaixo agora. O envio só poderá ser ativado depois que o WhatsApp estiver conectado.</p> : null}

      <div className={styles.presets}>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: "var(--font-weight-bold)" }}>
            <input type="radio" name="orderNotificationPreset" value="simple" checked={preset === "simple"} onChange={() => setPreset("simple")} />
            Simples
          </span>
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Menos mensagens: recebido, aviso principal de retirada/entrega e cancelamento.</span>
        </label>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: "var(--font-weight-bold)" }}>
            <input type="radio" name="orderNotificationPreset" value="complete" checked={preset === "complete"} onChange={() => setPreset("complete")} />
            Completo
          </span>
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Seleciona todas as etapas, mas nenhuma delas ignora módulo, plano, operação ou saúde do canal.</span>
        </label>
        <label style={boxStyle}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: "var(--font-weight-bold)" }}>
            <input type="radio" name="orderNotificationPreset" value="custom" checked={preset === "custom"} onChange={() => setPreset("custom")} />
            Personalizado
          </span>
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>A unidade escolhe individualmente quais etapas elegíveis deseja comunicar.</span>
        </label>
      </div>

      <div style={boxStyle}>
        <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontWeight: "var(--font-weight-bold)" }}>
          <input
            type="checkbox"
            checked={includeInitialTrackingLink}
            onChange={(event) => setInitialTrackingLink(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Incluir link de acompanhamento na confirmação inicial
            <span className="muted" style={{ display: "block", fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-regular)", marginTop: 3 }}>
              Quando desligado, o primeiro aviso enviado como mensagem livre não inclui o link. As atualizações seguintes continuam sem repetir o link. Fora da janela de atendimento, o modelo aprovado pela Meta não é alterado por esta opção.
            </span>
          </span>
        </label>
      </div>

      <div style={{ ...boxStyle, opacity: custom ? 1 : 0.86 }}>
        <strong>Etapas do fluxo e textos</strong>
        {!custom ? <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>O preset altera somente quais avisos ficam ligados. Os textos podem ser preparados sem ativar módulos, comprar plano ou ampliar permissões.</span> : null}
        <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>O texto editado é usado apenas quando a Meta permite mensagem livre. Fora da janela de atendimento, o PedeAqui continua usando o modelo aprovado na Meta; editar aqui não altera nem contorna essa aprovação.</span>
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
                  <span className={styles.stageHeading}>
                    <span style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                      <input type="checkbox" name={field.name} defaultChecked={defaults[field.defaultKey]} disabled={disabledToggle} style={{ marginTop: 3 }} />
                      <span>
                        <strong>{capability.label}</strong>
                        <span className="muted" style={{ display: "block", fontSize: "var(--font-size-support)", marginTop: 2 }}>{capability.description}</span>
                      </span>
                    </span>
                    <span style={{ fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)", overflowWrap: "anywhere" }}>{stateLabel[capability.state]}</span>
                  </span>
                  <span className="muted" style={{ fontSize: "var(--font-size-support)", paddingLeft: 26 }}>Gatilho: {capability.triggerLabel}</span>
                  {capability.dependencyLabel ? <span className="muted" style={{ fontSize: "var(--font-size-support)", paddingLeft: 26 }}>Depende de: {capability.dependencyLabel}</span> : null}
                  {capability.reason ? <span style={{ fontSize: "var(--font-size-support)", paddingLeft: 26, fontWeight: "var(--font-weight-bold)" }}>{capability.reason}</span> : null}
                </label>

                <FormDisclosure summary="Editar texto e visualizar prévia" className={styles.editor}>
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <textarea
                      id={`order-notification-text-${field.key}`}
                      aria-label={`Texto do aviso: ${capability.label}`}
                      name={`orderNotificationText_${field.key}`}
                      value={text}
                      disabled={!capability.configurable}
                      onChange={(event) => setTexts((current) => ({ ...current, [field.key]: event.target.value }))}
                      style={textStyle}
                    />
                    <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>
                      Variáveis permitidas: {ORDER_NOTIFICATION_PLACEHOLDERS.map((placeholder) => `{${placeholder}}`).join(", ")}.
                    </span>
                    {!validation.ok ? <span style={{ fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)" }}>{validation.message}</span> : null}
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
                    <div style={{ padding: 10, borderRadius: "var(--radius-sm)", border: "1px dashed var(--border)" }}>
                      <strong style={{ fontSize: "var(--font-size-support)" }}>Prévia</strong>
                      <p style={{ margin: "5px 0 0", fontSize: "var(--font-size-support)", whiteSpace: "pre-wrap" }}>{preview ?? "A prévia usa o texto padrão quando faltar uma variável real no pedido."}</p>
                    </div>
                  </div>
                </FormDisclosure>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
