import { normalizeWhatsAppIdentifier } from "@/server/conversations/model";

export type WhatsAppBotStep = "menu" | "awaiting_tracking_code";
export type WhatsAppBotIntent = "menu" | "menu_link" | "track_start" | "track_code" | "handoff" | "hours" | "payment" | "delivery" | "order_start" | "unknown";

const menuWords = new Set([
  "menu",
  "inicio",
  "iniciar",
  "oi",
  "ola",
  "oie",
  "oi tudo bem",
  "ola tudo bem",
  "bom dia",
  "boa tarde",
  "boa noite",
  "tudo bem",
  "ver opcoes",
  "bot_menu_open",
]);
const menuLinkWords = new Set([
  "1",
  "cardapio",
  "ver cardapio",
  "abrir cardapio",
  "manda o cardapio",
  "me manda o cardapio",
  "quero ver o cardapio",
  "tem cardapio",
  "link do cardapio",
]);
const trackingWords = new Set([
  "2",
  "acompanhar",
  "acompanhar pedido",
  "meu pedido",
  "pedido",
  "onde esta meu pedido",
  "como esta meu pedido",
  "status do pedido",
  "meu pedido ja saiu",
]);
const handoffWords = new Set([
  "3",
  "atendente",
  "humano",
  "falar com restaurante",
  "falar com o restaurante",
  "falar com atendente",
  "falar com uma pessoa",
  "quero falar com alguem",
  "me chama um atendente",
  "preciso falar com alguem",
  "ajuda",
]);
const hoursWords = new Set([
  "4",
  "horario",
  "horarios",
  "funcionamento",
  "abre",
  "fecha",
  "aberto",
  "aberta",
  "que horas abre",
  "que horas fecha",
  "esta aberto",
  "esta aberta",
  "voces estao abertos",
  "voces estao abertas",
]);
const paymentWords = new Set([
  "5",
  "pagamento",
  "pagamentos",
  "formas de pagamento",
  "pagar",
  "cartao",
  "pix",
  "dinheiro",
  "credito",
  "debito",
  "ticket",
  "alelo",
  "vr",
  "vale refeicao",
  "aceita pix",
  "aceita cartao",
  "aceita dinheiro",
  "como posso pagar",
]);
const deliveryWords = new Set([
  "6",
  "entrega",
  "delivery",
  "taxa",
  "taxa de entrega",
  "frete",
  "bairro",
  "entregam",
  "voces entregam",
  "tem entrega",
  "quanto e a entrega",
  "quanto custa a entrega",
  "quanto tempo demora",
  "tempo de entrega",
  "entrega aqui",
]);
const orderStartWords = new Set([
  "7",
  "fazer pedido",
  "quero pedir",
  "pedido pelo whatsapp",
  "pedir pelo whatsapp",
  "montar pedido",
  "quero fazer um pedido",
  "quero fazer pedido",
  "posso pedir por aqui",
  "quero comprar",
]);

export function normalizeBotInput(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsAny(value: string, words: Set<string>) {
  if (words.has(value)) return true;
  return [...words].some((word) => word.length > 3 && value.includes(word));
}

export function trackingCodeFromInput(value: string | null | undefined) {
  const normalized = normalizeBotInput(value).replace(/^pedido\s*/, "").replace(/^#/, "").trim();
  return /^\d{1,12}$/.test(normalized) ? Number(normalized) : null;
}

export function resolveWhatsAppBotIntent(value: string | null | undefined, step: WhatsAppBotStep): WhatsAppBotIntent {
  const normalized = normalizeBotInput(value);
  if (step === "awaiting_tracking_code" && trackingCodeFromInput(normalized) !== null) return "track_code";
  if (menuWords.has(normalized)) return "menu";
  if (containsAny(normalized, orderStartWords)) return "order_start";
  if (containsAny(normalized, menuLinkWords)) return "menu_link";
  if (containsAny(normalized, trackingWords)) return "track_start";
  if (containsAny(normalized, handoffWords)) return "handoff";
  if (containsAny(normalized, hoursWords)) return "hours";
  if (containsAny(normalized, paymentWords)) return "payment";
  if (containsAny(normalized, deliveryWords)) return "delivery";
  return "unknown";
}

function orderMenuLine(includeWhatsAppOrders: boolean) {
  return includeWhatsAppOrders ? "\n7 — Fazer pedido pelo WhatsApp" : "";
}

function menuOptions(includeWhatsAppOrders: boolean) {
  return `1 — Ver cardápio\n2 — Acompanhar pedido\n3 — Falar com o restaurante\n4 — Horários\n5 — Formas de pagamento\n6 — Entrega e taxa${orderMenuLine(includeWhatsAppOrders)}`;
}

export function appendWhatsAppBotMenu(introduction: string, includeWhatsAppOrders = false) {
  return `${introduction.trim()}\n\nSe quiser, pode me dizer com suas palavras o que precisa 😊\nOu escolha uma opção:\n${menuOptions(includeWhatsAppOrders)}`;
}

export function buildWhatsAppBotMenu(storeName: string, includeWhatsAppOrders = false, botName?: string | null) {
  const identity = botName?.trim() ? ` Eu sou ${botName.trim()}, o atendimento virtual.` : "";
  return `Oi! 😊 Estou por aqui para ajudar com ${storeName.trim()}.${identity}\nVocê pode escrever normalmente o que precisa ou escolher uma opção:\n\n${menuOptions(includeWhatsAppOrders)}`;
}

export function phonesBelongToSameCustomer(left: string | null | undefined, right: string | null | undefined) {
  const first = normalizeWhatsAppIdentifier(left);
  const second = normalizeWhatsAppIdentifier(right);
  if (!first || !second) return false;
  if (first === second) return true;
  if (first.startsWith("55") && first.slice(2) === second) return true;
  return second.startsWith("55") && second.slice(2) === first;
}

const orderStatusLabels: Record<string, string> = {
  pending_confirmation: "aguardando confirmação do restaurante",
  confirmed: "confirmado",
  rejected: "recusado",
  canceled: "cancelado",
  completed: "concluído",
};

const productionStatusLabels: Record<string, string> = {
  pending_confirmation: "aguardando confirmação",
  queued: "na fila de preparo",
  preparing: "em preparo",
  ready: "pronto",
  canceled: "preparo cancelado",
  not_required: "sem preparo necessário",
};

const fulfillmentStatusLabels: Record<string, string> = {
  pending: "aguardando expedição",
  awaiting_assignment: "aguardando entregador",
  assigned: "entregador definido",
  picked_up: "retirado pelo entregador",
  out_for_delivery: "saiu para entrega",
  delivered: "entregue",
  awaiting_pickup: "pronto para retirada",
  picked_up_by_customer: "retirado pelo cliente",
  served: "servido",
  canceled: "entrega/retirada cancelada",
  not_required: "sem entrega necessária",
};

export function buildOrderLookupMessage(input: {
  displayNumber: number;
  orderStatus: string;
  productionStatus: string;
  fulfillmentStatus: string;
  trackingUrl?: string | null;
}) {
  const order = orderStatusLabels[input.orderStatus] ?? "em atualização";
  const production = productionStatusLabels[input.productionStatus] ?? "em atualização";
  const fulfillment = fulfillmentStatusLabels[input.fulfillmentStatus] ?? "em atualização";
  const link = input.trackingUrl ? `\nAcompanhe os detalhes com segurança: ${input.trackingUrl}` : "";
  return `Achei seu pedido #${input.displayNumber} 😊\nPedido #${input.displayNumber}: ${order}. Preparo: ${production}. Entrega/retirada: ${fulfillment}.${link}`;
}

export const TRACKING_CODE_PROMPT = "Claro! Me manda o número do seu pedido que aparece na confirmação 😊 Pode enviar só o número, por exemplo: 42. Se quiser voltar, é só escrever menu.";
export const TRACKING_NOT_FOUND_MESSAGE = "Hmm, não encontrei esse pedido ligado ao seu número neste restaurante. Confira o código e tente de novo. Se preferir, escreva \"falar com atendente\" que eu chamo a equipe para você.";
