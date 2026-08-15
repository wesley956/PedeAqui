const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/gi;
const RAW_URL_PATTERN = /(https?:\/\/|www\.)/i;

export const DEFAULT_WHATSAPP_GREETING = "Olá! 👋 Bem-vindo ao {restaurante}. Para ver nosso cardápio e fazer seu pedido, acesse: {link}. Se precisar falar com alguém, é só me avisar.";
export const DEFAULT_WHATSAPP_GREETING_FALLBACK = "Olá! Nosso cardápio online não está disponível para pedidos neste momento. Vou encaminhar seu atendimento para nossa equipe.";

export function validateGreetingTemplate(template: string) {
  const value = template.trim();
  if (value.length < 20 || value.length > 1000) return false;
  if (RAW_URL_PATTERN.test(value)) return false;
  const placeholders = [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]?.toLowerCase());
  if (!placeholders.includes("link")) return false;
  return placeholders.every((placeholder) => placeholder === "link" || placeholder === "restaurante");
}

export function validateGreetingFallback(message: string) {
  const value = message.trim();
  return value.length >= 10 && value.length <= 800 && !RAW_URL_PATTERN.test(value) && !PLACEHOLDER_PATTERN.test(value);
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
  if (!validateGreetingTemplate(template)) throw new Error("Template de saudação inválido.");
  return template.trim()
    .replaceAll("{restaurante}", storeName.trim())
    .replaceAll("{link}", menuUrl);
}
