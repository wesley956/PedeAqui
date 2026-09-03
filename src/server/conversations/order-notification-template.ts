export const ORDER_NOTIFICATION_TYPES = [
  "order_received",
  "order_confirmed",
  "production_preparing",
  "payment_paid",
  "pickup_ready",
  "pickup_completed",
  "out_for_delivery",
  "delivered",
  "order_canceled",
] as const;

export type OrderNotificationType = (typeof ORDER_NOTIFICATION_TYPES)[number];

export const ORDER_NOTIFICATION_PLACEHOLDERS = [
  "cliente",
  "restaurante",
  "pedido",
  "status",
  "link_cardapio",
  "link_acompanhamento",
] as const;

export type OrderNotificationPlaceholder = (typeof ORDER_NOTIFICATION_PLACEHOLDERS)[number];
export type OrderNotificationTemplateMap = Partial<Record<OrderNotificationType, string>>;
export type OrderNotificationTemplateValues = Partial<Record<OrderNotificationPlaceholder, string | null | undefined>>;

const allowedPlaceholders = new Set<string>(ORDER_NOTIFICATION_PLACEHOLDERS);
const allowedTypes = new Set<string>(ORDER_NOTIFICATION_TYPES);
const placeholderPattern = /\{([a-z_]+)\}/g;
const arbitraryUrlPattern = /(?:https?:\/\/|www\.)/i;
const htmlPattern = /<\/?[a-z][^>]*>/i;

const DEFAULT_TEMPLATES: Record<OrderNotificationType, string> = {
  order_received: "{restaurante}: recebemos seu pedido {pedido}. Acompanhe por aqui: {link_acompanhamento}",
  order_confirmed: "{restaurante}: seu pedido {pedido} foi confirmado. Acompanhe: {link_acompanhamento}",
  production_preparing: "Seu pedido {pedido} já está em preparo. Acompanhe: {link_acompanhamento}",
  payment_paid: "Pagamento do pedido {pedido} confirmado. Acompanhe: {link_acompanhamento}",
  pickup_ready: "Seu pedido {pedido} está pronto para retirada. Acompanhe: {link_acompanhamento}",
  pickup_completed: "Pedido {pedido} retirado. Obrigado por pedir com {restaurante}!",
  out_for_delivery: "Seu pedido {pedido} saiu para entrega. Acompanhe: {link_acompanhamento}",
  delivered: "Seu pedido {pedido} foi entregue. Obrigado por pedir com {restaurante}!",
  order_canceled: "Seu pedido {pedido} foi cancelado. Se precisar de ajuda, fale com {restaurante}.",
};

export function defaultOrderNotificationText(type: OrderNotificationType) {
  return DEFAULT_TEMPLATES[type];
}

export function validateOrderNotificationTextTemplate(value: string) {
  const text = value.trim();
  if (!text || text.length > 1000) {
    return { ok: false as const, message: "A mensagem deve ter entre 1 e 1000 caracteres." };
  }
  if (htmlPattern.test(text)) {
    return { ok: false as const, message: "HTML e scripts não são permitidos nas mensagens." };
  }
  if (arbitraryUrlPattern.test(text)) {
    return { ok: false as const, message: "Use apenas os placeholders de link fornecidos pelo PedeAqui." };
  }

  const placeholders = [...text.matchAll(placeholderPattern)]
    .map((match) => match[1])
    .filter((placeholder): placeholder is string => typeof placeholder === "string");
  const unknown = placeholders.find((placeholder) => !allowedPlaceholders.has(placeholder));
  if (unknown) {
    return { ok: false as const, message: `Placeholder não permitido: {${unknown}}.` };
  }

  const withoutKnown = text.replace(placeholderPattern, "");
  if (/[{}]/.test(withoutKnown)) {
    return { ok: false as const, message: "Revise as chaves dos placeholders da mensagem." };
  }

  return { ok: true as const, message: null };
}

export function renderOrderNotificationTextTemplate(value: string, values: OrderNotificationTemplateValues) {
  const validation = validateOrderNotificationTextTemplate(value);
  if (!validation.ok) return null;

  let missing = false;
  const rendered = value.trim().replace(placeholderPattern, (_match, placeholder: OrderNotificationPlaceholder) => {
    const replacement = values[placeholder];
    if (replacement === null || replacement === undefined || replacement === "") {
      missing = true;
      return "";
    }
    return replacement;
  });
  return missing ? null : rendered;
}

export function normalizeOrderNotificationCustomTemplates(value: unknown): OrderNotificationTemplateMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: OrderNotificationTemplateMap = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedTypes.has(key) || typeof raw !== "string") continue;
    const text = raw.trim();
    if (!text || text === defaultOrderNotificationText(key as OrderNotificationType)) continue;
    if (!validateOrderNotificationTextTemplate(text).ok) continue;
    normalized[key as OrderNotificationType] = text;
  }
  return normalized;
}
