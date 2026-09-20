export type WhatsAppFailureCategory =
  | "identity"
  | "configuration"
  | "meta_window_template"
  | "provider"
  | "transient"
  | "integrity"
  | "workflow"
  | "unknown";

const CATEGORY_LABELS: Record<WhatsAppFailureCategory, string> = {
  identity: "Identidade/destinatário",
  configuration: "Configuração da unidade",
  meta_window_template: "Janela/modelo da Meta",
  provider: "Meta/provedor",
  transient: "Falha transitória",
  integrity: "Correlação/integridade",
  workflow: "Regra do fluxo",
  unknown: "Falha não classificada",
};

const IDENTITY_CODES = new Set([
  "customer_phone_missing",
  "customer_phone_conflict",
]);

const CONFIGURATION_CODES = new Set([
  "notification_disabled",
  "automation_suspended_module",
  "automation_suspended_entitlement",
  "automation_suspended_channel",
  "automation_unavailable_profile",
  "automation_invalid_configuration",
  "whatsapp_not_configured",
  "app_url_missing",
  "tracking_context_missing",
  "store_unavailable",
]);

const WORKFLOW_CODES = new Set([
  "workflow_stage_hidden",
  "workflow_checkpoint_duplicate",
  "cancel_state_mismatch",
  "order_terminal_problem",
  "not_pickup",
  "not_delivery",
]);

const INTEGRITY_CODES = new Set([
  "authoritative_event_missing",
  "order_missing",
  "tenant_mismatch",
]);

export function classifyOrderNotificationFailure(code: string | null | undefined): WhatsAppFailureCategory | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  if (IDENTITY_CODES.has(normalized)) return "identity";
  if (CONFIGURATION_CODES.has(normalized)) return "configuration";
  if (WORKFLOW_CODES.has(normalized)) return "workflow";
  if (INTEGRITY_CODES.has(normalized)) return "integrity";
  if (normalized === "template_required" || normalized.includes("template")) return "meta_window_template";
  if (normalized === "whatsapp_temporarily_unavailable" || normalized === "notification_error") return "transient";
  if (normalized.startsWith("provider_")) return "provider";
  return "unknown";
}

export function orderNotificationFailureLabel(code: string | null | undefined) {
  const category = classifyOrderNotificationFailure(code);
  return category ? CATEGORY_LABELS[category] : null;
}

export function maskWhatsAppRecipient(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  const suffix = digits.slice(-4).padStart(4, "•");
  return `••••${suffix}`;
}

export function notificationDeliveryLabel(input: {
  queueStatus: string;
  providerStatus?: string | null;
}) {
  switch (input.providerStatus) {
    case "read": return "Lida pelo cliente";
    case "delivered": return "Entregue ao cliente";
    case "sent": return "Aceita pela Meta";
    case "failed": return "Rejeitada/falhou no provedor";
  }
  switch (input.queueStatus) {
    case "pending": return "Aguardando processamento";
    case "processing": return "Em processamento";
    case "sent": return "Envio solicitado";
    case "failed": return "Aguardando nova tentativa";
    case "skipped": return "Não enviada por regra segura";
    default: return "Estado desconhecido";
  }
}
