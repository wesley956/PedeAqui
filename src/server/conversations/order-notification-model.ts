export const WHATSAPP_AUTOMATION_PRESETS = ["simple", "complete", "custom"] as const;
export type WhatsAppAutomationPreset = (typeof WHATSAPP_AUTOMATION_PRESETS)[number];

export type OrderNotificationType =
  | "order_received"
  | "order_confirmed"
  | "production_preparing"
  | "payment_paid"
  | "pickup_ready"
  | "pickup_completed"
  | "out_for_delivery"
  | "delivered";

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
}) {
  const number = `#${input.displayNumber}`;
  switch (input.type) {
    case "order_received":
      return `${input.storeName}: recebemos seu pedido ${number}. Acompanhe por aqui: ${input.trackingUrl}`;
    case "order_confirmed":
      return `${input.storeName}: seu pedido ${number} foi confirmado. Acompanhe: ${input.trackingUrl}`;
    case "production_preparing":
      return `Seu pedido ${number} já está em preparo. Acompanhe: ${input.trackingUrl}`;
    case "payment_paid":
      return `Pagamento do pedido ${number} confirmado. Acompanhe: ${input.trackingUrl}`;
    case "pickup_ready":
      return `Seu pedido ${number} está pronto para retirada. Acompanhe: ${input.trackingUrl}`;
    case "pickup_completed":
      return `Pedido ${number} retirado. Obrigado por pedir com ${input.storeName}!`;
    case "out_for_delivery":
      return `Seu pedido ${number} saiu para entrega. Acompanhe: ${input.trackingUrl}`;
    case "delivered":
      return `Seu pedido ${number} foi entregue. Obrigado por pedir com ${input.storeName}!`;
  }
}

export function retryDelaySeconds(attempts: number) {
  return Math.min(3600, Math.max(60, 60 * 2 ** Math.max(0, Math.min(attempts - 1, 6))));
}
