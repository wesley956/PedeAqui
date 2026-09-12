import { normalizeWhatsAppIdentifier } from "@/server/conversations/model";

export type WhatsAppBotStep = "menu" | "awaiting_tracking_code";
export type WhatsAppBotIntent = "menu" | "menu_link" | "track_start" | "track_code" | "handoff" | "hours" | "payment" | "delivery" | "unknown";

const menuWords = new Set(["menu", "inicio", "iniciar", "oi", "ola", "bom dia", "boa tarde", "boa noite"]);
const menuLinkWords = new Set(["1", "cardapio", "ver cardapio", "fazer pedido", "pedir"]);
const trackingWords = new Set(["2", "acompanhar", "acompanhar pedido", "meu pedido", "pedido"]);
const handoffWords = new Set(["3", "atendente", "humano", "falar com restaurante", "falar com o restaurante", "ajuda"]);
const hoursWords = new Set(["4", "horario", "horarios", "funcionamento", "abre", "fecha", "aberto", "aberta"]);
const paymentWords = new Set(["5", "pagamento", "pagamentos", "formas de pagamento", "pagar", "cartao", "pix", "dinheiro", "credito", "debito", "ticket", "alelo", "vr"]);
const deliveryWords = new Set(["6", "entrega", "delivery", "taxa", "taxa de entrega", "frete", "bairro", "entregam"]);

export function normalizeBotInput(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  if (containsAny(normalized, menuLinkWords)) return "menu_link";
  if (containsAny(normalized, trackingWords)) return "track_start";
  if (containsAny(normalized, handoffWords)) return "handoff";
  if (containsAny(normalized, hoursWords)) return "hours";
  if (containsAny(normalized, paymentWords)) return "payment";
  if (containsAny(normalized, deliveryWords)) return "delivery";
  return "unknown";
}

export function appendWhatsAppBotMenu(introduction: string) {
  return `${introduction.trim()}\n\nDigite uma opção:\n1 — Ver cardápio\n2 — Acompanhar pedido\n3 — Falar com o restaurante\n4 — Horários\n5 — Formas de pagamento\n6 — Entrega e taxa`;
}

export function buildWhatsAppBotMenu(storeName: string) {
  return `Como posso ajudar com ${storeName.trim()}?\n\nDigite uma opção:\n1 — Ver cardápio\n2 — Acompanhar pedido\n3 — Falar com o restaurante\n4 — Horários\n5 — Formas de pagamento\n6 — Entrega e taxa`;
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
  return `Pedido #${input.displayNumber}: ${order}. Preparo: ${production}. Entrega/retirada: ${fulfillment}.${link}`;
}

export const TRACKING_CODE_PROMPT = "Digite somente o código do pedido que aparece na confirmação (por exemplo: 42). Para voltar, digite menu.";
export const TRACKING_NOT_FOUND_MESSAGE = "Não encontrei esse pedido para o seu número neste restaurante. Confira o código ou digite 3 para falar com a equipe.";
