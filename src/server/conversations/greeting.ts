const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/gi;
const RAW_URL_PATTERN = /(https?:\/\/|www\.)/i;

export const WHATSAPP_BOT_MENU_MODES = ["conversation_first", "menu_first", "interactive"] as const;
export type WhatsAppBotMenuMode = (typeof WHATSAPP_BOT_MENU_MODES)[number];

export const DEFAULT_WHATSAPP_GREETING = "Oi! 😊 Estou por aqui para ajudar com {restaurante}. Pode escrever normalmente o que você precisa.";
export const DEFAULT_WHATSAPP_GREETING_FALLBACK = "Olá! Nosso cardápio online não está disponível para pedidos neste momento. Vou encaminhar seu atendimento para nossa equipe.";
export const DEFAULT_WHATSAPP_HANDOFF_MESSAGE = "Certo! Encaminhei sua conversa para a equipe do restaurante. Assim que alguém estiver disponível, continuará o atendimento por aqui.";
export const DEFAULT_WHATSAPP_UNKNOWN_MESSAGE = "Não consegui entender desta vez. Você pode escrever de outro jeito ou digitar menu para ver as opções.";

export function validateGreetingTemplate(template: string, options: { requireMenuLink?: boolean } = {}) {
  const value = template.trim();
  if (value.length < 20 || value.length > 1000) return false;
  if (RAW_URL_PATTERN.test(value)) return false;
  const placeholders = [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]?.toLowerCase());
  if ((options.requireMenuLink ?? true) && !placeholders.includes("link")) return false;
  return placeholders.every((placeholder) => placeholder === "link" || placeholder === "restaurante");
}

export function validateGreetingFallback(message: string) {
  const value = message.trim();
  return value.length >= 10 && value.length <= 800 && !RAW_URL_PATTERN.test(value) && !PLACEHOLDER_PATTERN.test(value);
}

export function validateBotDisplayName(value: string | null | undefined) {
  if (!value) return true;
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 60 && !RAW_URL_PATTERN.test(normalized) && !PLACEHOLDER_PATTERN.test(normalized);
}

export function validateBotReplyMessage(value: string) {
  const normalized = value.trim();
  return normalized.length >= 10 && normalized.length <= 800 && !RAW_URL_PATTERN.test(normalized) && !PLACEHOLDER_PATTERN.test(normalized);
}

export function buildPublicMenuUrl(appUrl: string, storeSlug: string) {
  const origin = new URL(appUrl);
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) {
    throw new Error("APP_URL inválida para link público do cardápio.");
  }
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new Error("APP_URL deve usar HTTPS em produção.");
  }
  origin.pathname = `/m/${encodeURIComponent(storeSlug)}`;
  origin.search = "";
  origin.hash = "";
  return origin.toString();
}

export function renderGreetingTemplate(template: string, storeName: string, menuUrl: string) {
  if (!validateGreetingTemplate(template, { requireMenuLink: false })) throw new Error("Template de saudação inválido.");
  return template.trim()
    .replaceAll("{restaurante}", storeName.trim())
    .replaceAll("{link}", menuUrl);
}
