import {
  defaultOrderNotificationText,
  renderOrderNotificationTextTemplate,
  type OrderNotificationType,
} from "@/server/conversations/order-notification-template";
import { projectOrderNotification } from "@/server/conversations/order-tracking-projection";
import type { OrderNotificationSummary } from "@/server/orders/order-notification-summary-service";
import { resolvePublicAppOrigin } from "@/server/public-app-url";

export type { OrderNotificationType } from "@/server/conversations/order-notification-template";

export const WHATSAPP_AUTOMATION_PRESETS = ["simple", "complete", "custom"] as const;
export type WhatsAppAutomationPreset = (typeof WHATSAPP_AUTOMATION_PRESETS)[number];

export type OrderNotificationFlags = {
  order_notifications_enabled?: boolean | null;
  order_notification_preset?: WhatsAppAutomationPreset | string | null;
  notify_order_received?: boolean | null;
  notify_order_confirmed?: boolean | null;
  notify_production_preparing?: boolean | null;
  notify_payment_paid?: boolean | null;
  notify_pickup_ready?: boolean | null;
  notify_pickup_completed?: boolean | null;
  notify_out_for_delivery?: boolean | null;
  notify_delivered?: boolean | null;
  notify_order_canceled?: boolean | null;
};

export type OrderNotificationSelection = {
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

const flagByType: Record<OrderNotificationType, keyof OrderNotificationFlags> = {
  order_received: "notify_order_received",
  order_confirmed: "notify_order_confirmed",
  production_preparing: "notify_production_preparing",
  payment_paid: "notify_payment_paid",
  pickup_ready: "notify_pickup_ready",
  pickup_completed: "notify_pickup_completed",
  out_for_delivery: "notify_out_for_delivery",
  delivered: "notify_delivered",
  order_canceled: "notify_order_canceled",
};

const SIMPLE_PRESET: OrderNotificationSelection = {
  notifyOrderReceived: true,
  notifyOrderConfirmed: false,
  notifyProductionPreparing: false,
  notifyPaymentPaid: false,
  notifyPickupReady: true,
  notifyPickupCompleted: false,
  notifyOutForDelivery: true,
  notifyDelivered: false,
  notifyOrderCanceled: true,
};

const COMPLETE_PRESET: OrderNotificationSelection = {
  notifyOrderReceived: true,
  notifyOrderConfirmed: true,
  notifyProductionPreparing: true,
  notifyPaymentPaid: true,
  notifyPickupReady: true,
  notifyPickupCompleted: true,
  notifyOutForDelivery: true,
  notifyDelivered: true,
  notifyOrderCanceled: true,
};

export function normalizeWhatsAppAutomationPreset(value: unknown): WhatsAppAutomationPreset {
  return value === "simple" || value === "complete" ? value : "custom";
}

export function resolveOrderNotificationSelection(
  preset: WhatsAppAutomationPreset,
  custom: OrderNotificationSelection,
): OrderNotificationSelection {
  if (preset === "simple") return { ...SIMPLE_PRESET };
  if (preset === "complete") return { ...COMPLETE_PRESET };
  return { ...custom };
}

export function notificationEnabled(settings: OrderNotificationFlags, type: OrderNotificationType) {
  return Boolean(settings.order_notifications_enabled && settings[flagByType[type]]);
}

function compactId(value: string) {
  return value.replaceAll("-", "");
}

export function notificationClientMessageId(input: {
  organizationId: string;
  storeId: string;
  orderId: string;
  type: OrderNotificationType;
  authoritativeEventId: string;
}) {
  const key = [
    "order-wa:v2",
    compactId(input.organizationId),
    compactId(input.storeId),
    compactId(input.orderId),
    input.type,
    compactId(input.authoritativeEventId),
  ].join(":");
  if (key.length > 180) throw new Error("Order notification idempotency key is too long");
  return key;
}

export function buildOrderTrackingUrl(appUrl: string, slug: string, orderId: string, accessToken: string) {
  const url = resolvePublicAppOrigin(appUrl);
  url.pathname = `/m/${encodeURIComponent(slug)}/pedido/${encodeURIComponent(orderId)}/acesso`;
  url.searchParams.set("t", accessToken);
  return url.toString();
}

export function buildPublicMenuUrl(appUrl: string, slug: string) {
  const url = resolvePublicAppOrigin(appUrl);
  url.pathname = `/m/${encodeURIComponent(slug)}`;
  return url.toString();
}

export function notificationStatusText(type: OrderNotificationType) {
  return projectOrderNotification(type).statusText;
}

export function shouldIncludeOrderTrackingLink(type: OrderNotificationType, channel: string | null | undefined) {
  return type === "order_received" && channel !== "whatsapp";
}

export function buildOrderNotificationTemplateParameters(input: {
  type: OrderNotificationType;
  storeName: string;
  displayNumber: number;
  trackingUrl: string;
}) {
  // The approved Meta template has a fixed four-parameter contract. Keep this
  // unchanged even when the free-form message applies the smart-link policy.
  return [
    input.storeName,
    `#${input.displayNumber}`,
    notificationStatusText(input.type),
    input.trackingUrl,
  ];
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function humanizeSnapshot(value: string | null) {
  if (!value) return "Não informado";
  const known: Record<string, string> = {
    pix: "Pix",
    cash: "Dinheiro",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    card: "Cartão",
    ticket: "Ticket",
  };
  if (known[value]) return known[value];
  const normalized = value.replace(/[_-]+/g, " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : value;
}

function orderReceivedBody(input: {
  summary: OrderNotificationSummary;
  trackingUrl: string;
  includeTrackingLink: boolean;
}) {
  const lines = [
    `✅ Pedido #${input.summary.displayNumber} recebido!`,
    "",
    "🧾 Resumo do pedido",
  ];

  for (const item of input.summary.items) {
    lines.push(`• ${item.quantity}x ${item.name} — ${formatMoney(item.lineTotalCents)}`);
    for (const modifier of item.modifiers) {
      const quantity = modifier.quantity > 1 ? `${modifier.quantity}x ` : "";
      const price = modifier.unitPriceCents > 0 ? ` (+${formatMoney(modifier.unitPriceCents * modifier.quantity)})` : "";
      lines.push(`  ↳ ${quantity}${modifier.name}${price}`);
    }
    if (item.note) lines.push(`  📝 ${item.note}`);
  }

  lines.push("");
  lines.push(input.summary.fulfillmentType === "delivery" ? "🚚 Entrega" : "🏪 Retirada");
  lines.push(`💳 Pagamento: ${humanizeSnapshot(input.summary.paymentMethod)}`);
  if (input.summary.discountCents > 0) lines.push(`🏷️ Desconto: -${formatMoney(input.summary.discountCents)}`);
  if (input.summary.deliveryFeeCents > 0) lines.push(`🚚 Taxa de entrega: ${formatMoney(input.summary.deliveryFeeCents)}`);
  lines.push(`💰 Total: ${formatMoney(input.summary.totalCents)}`);
  lines.push("");
  lines.push("Agora é só aguardar a confirmação da loja. 😊");
  if (input.includeTrackingLink) {
    lines.push("");
    lines.push(`🔎 Acompanhe seu pedido: ${input.trackingUrl}`);
  }
  return lines.join("\n");
}

function defaultVisualStatusBody(input: {
  type: OrderNotificationType;
  storeName: string;
  displayNumber: number;
  cancelReason?: string | null;
}) {
  const order = `#${input.displayNumber}`;
  switch (input.type) {
    case "order_confirmed": return `✅ Pedido ${order} confirmado!\nA loja confirmou seu pedido e ele seguirá para preparação.`;
    case "production_preparing": return `👩‍🍳 Pedido ${order} em preparo\nSua comida já está sendo preparada.`;
    case "payment_paid": return `💳 Pagamento do pedido ${order} confirmado!\nSeu pagamento foi identificado com sucesso.`;
    case "pickup_ready": return `🛍️ Pedido ${order} pronto para retirada\nSeu pedido já pode ser retirado na loja.`;
    case "pickup_completed": return `🎉 Pedido ${order} retirado\nObrigado por pedir com ${input.storeName}! ❤️`;
    case "out_for_delivery": return `🛵 Pedido ${order} saiu para entrega\nSeu pedido está a caminho!`;
    case "delivered": return `🎉 Pedido ${order} entregue\nObrigado por pedir com ${input.storeName}! ❤️`;
    case "order_canceled": return input.cancelReason
      ? `❌ Pedido ${order} cancelado\nMotivo: ${input.cancelReason}`
      : `❌ Pedido ${order} cancelado\nSe precisar de ajuda, fale com ${input.storeName}.`;
    case "order_received": return `✅ Pedido ${order} recebido!\nAgora é só aguardar a confirmação da loja. 😊`;
  }
}

export function buildOrderNotificationBody(input: {
  type: OrderNotificationType;
  storeName: string;
  displayNumber: number;
  trackingUrl: string;
  menuUrl?: string | null;
  customerName?: string | null;
  customTemplate?: string | null;
  summary?: OrderNotificationSummary | null;
  includeTrackingLink?: boolean;
  cancelReason?: string | null;
}) {
  const includeTrackingLink = input.includeTrackingLink ?? true;
  if (input.type === "order_received" && input.summary) {
    return orderReceivedBody({ summary: input.summary, trackingUrl: input.trackingUrl, includeTrackingLink });
  }

  const values = {
    cliente: input.customerName,
    restaurante: input.storeName,
    pedido: `#${input.displayNumber}`,
    status: notificationStatusText(input.type),
    link_cardapio: input.menuUrl,
    link_acompanhamento: includeTrackingLink ? input.trackingUrl : null,
  };
  if (input.customTemplate) {
    const custom = renderOrderNotificationTextTemplate(input.customTemplate, values);
    if (custom) return custom;
  }

  // Status updates intentionally do not repeat tracking links. Defaults remain
  // concise and are derived only from canonical state/cancellation snapshots.
  if (input.type !== "order_received" || !includeTrackingLink) {
    return defaultVisualStatusBody(input);
  }

  return renderOrderNotificationTextTemplate(defaultOrderNotificationText(input.type), values)
    ?? defaultVisualStatusBody(input);
}

export function retryDelaySeconds(attempts: number) {
  return Math.min(3600, Math.max(60, 60 * 2 ** Math.max(0, Math.min(attempts - 1, 6))));
}
