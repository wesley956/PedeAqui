import {
  defaultOrderNotificationText,
  renderOrderNotificationTextTemplate,
  type OrderNotificationType,
} from "@/server/conversations/order-notification-template";

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

const statusByType: Record<OrderNotificationType, string> = {
  order_received: "Pedido recebido",
  order_confirmed: "Pedido confirmado",
  production_preparing: "Pedido em preparo",
  payment_paid: "Pagamento confirmado",
  pickup_ready: "Pronto para retirada",
  pickup_completed: "Pedido retirado",
  out_for_delivery: "Saiu para entrega",
  delivered: "Pedido entregue",
  order_canceled: "Pedido cancelado",
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

export function notificationClientMessageId(orderId: string, type: OrderNotificationType) {
  return `order-notification:v1:${orderId}:${type}`;
}

export function buildOrderTrackingUrl(appUrl: string, slug: string, orderId: string, accessToken: string) {
  const url = new URL(`/m/${encodeURIComponent(slug)}/pedido/${encodeURIComponent(orderId)}/acesso`, appUrl);
  url.searchParams.set("t", accessToken);
  return url.toString();
}

export function buildPublicMenuUrl(appUrl: string, slug: string) {
  return new URL(`/m/${encodeURIComponent(slug)}`, appUrl).toString();
}

export function notificationStatusText(type: OrderNotificationType) {
  return statusByType[type];
}

export function buildOrderNotificationTemplateParameters(input: {
  type: OrderNotificationType;
  storeName: string;
  displayNumber: number;
  trackingUrl: string;
}) {
  return [
    input.storeName,
    `#${input.displayNumber}`,
    notificationStatusText(input.type),
    input.trackingUrl,
  ];
}

export function buildOrderNotificationBody(input: {
  type: OrderNotificationType;
  storeName: string;
  displayNumber: number;
  trackingUrl: string;
  menuUrl?: string | null;
  customerName?: string | null;
  customTemplate?: string | null;
}) {
  const values = {
    cliente: input.customerName,
    restaurante: input.storeName,
    pedido: `#${input.displayNumber}`,
    status: notificationStatusText(input.type),
    link_cardapio: input.menuUrl,
    link_acompanhamento: input.trackingUrl,
  };
  if (input.customTemplate) {
    const custom = renderOrderNotificationTextTemplate(input.customTemplate, values);
    if (custom) return custom;
  }
  return renderOrderNotificationTextTemplate(defaultOrderNotificationText(input.type), values)
    ?? `${input.storeName}: atualização do pedido #${input.displayNumber}: ${notificationStatusText(input.type)}.`;
}

export function retryDelaySeconds(attempts: number) {
  return Math.min(3600, Math.max(60, 60 * 2 ** Math.max(0, Math.min(attempts - 1, 6))));
}
