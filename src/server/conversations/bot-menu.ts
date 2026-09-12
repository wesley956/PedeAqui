import { normalizeWhatsAppIdentifier } from "@/server/conversations/model";
import { workflowStageLabels, type WorkflowStage } from "@/features/orders/workflow-config";
import type { CustomerBenefits, CustomerCouponBenefit } from "@/server/growth/customer-benefits";

export type WhatsAppBotStep = "menu" | "awaiting_tracking_code";
export type WhatsAppBotIntent = "menu" | "menu_link" | "track_start" | "track_code" | "handoff" | "benefit_handoff" | "hours" | "payment" | "delivery" | "order_start" | "benefits" | "cashback" | "points" | "coupons" | "promotions" | "unknown";

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
const benefitHandoffWords = new Set(["saldo errado", "saldo esta errado", "cashback errado", "cashback esta errado", "pontos errados", "pontos estao errados", "cupom nao funciona", "cupom nao funcionou", "nao aceitou meu cupom", "contestar saldo"]);
const cashbackWords = new Set(["cashback", "meu cashback", "tenho cashback", "saldo de cashback", "quanto tenho de cashback"]);
const pointsWords = new Set(["pontos", "meus pontos", "quantos pontos tenho", "tenho pontos", "saldo de pontos"]);
const couponWords = new Set(["cupom", "cupons", "tem cupom para mim", "tenho cupom", "cupom de desconto", "codigo de desconto"]);
const promotionWords = new Set(["promocao", "promocoes", "qual promocao esta ativa", "tem promocao", "oferta", "ofertas"]);
const benefitWords = new Set(["beneficio", "beneficios", "meus beneficios", "tenho desconto", "tem desconto para mim", "qual desconto eu tenho"]);

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
  if (containsAny(normalized, benefitHandoffWords)) return "benefit_handoff";
  if (containsAny(normalized, cashbackWords)) return "cashback";
  if (containsAny(normalized, pointsWords)) return "points";
  if (containsAny(normalized, couponWords)) return "coupons";
  if (containsAny(normalized, promotionWords)) return "promotions";
  if (containsAny(normalized, benefitWords)) return "benefits";
  if (containsAny(normalized, menuLinkWords)) return "menu_link";
  if (containsAny(normalized, trackingWords)) return "track_start";
  if (containsAny(normalized, handoffWords)) return "handoff";
  if (containsAny(normalized, hoursWords)) return "hours";
  if (containsAny(normalized, paymentWords)) return "payment";
  if (containsAny(normalized, deliveryWords)) return "delivery";
  return "unknown";
}

export function isGrowthBenefitIntent(intent: WhatsAppBotIntent): intent is "benefits" | "cashback" | "points" | "coupons" | "promotions" {
  return ["benefits", "cashback", "points", "coupons", "promotions"].includes(intent);
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function couponLine(coupon: CustomerCouponBenefit) {
  const discount = coupon.discount_type === "fixed"
    ? money(Number(coupon.fixed_discount_cents ?? 0))
    : `${Number(coupon.percentage_bps ?? 0) / 100}%${coupon.max_discount_cents ? ` (até ${money(coupon.max_discount_cents)})` : ""}`;
  const minimum = coupon.minimum_order_cents > 0 ? ` em pedidos a partir de ${money(coupon.minimum_order_cents)}` : "";
  const validity = coupon.valid_until ? `, válido até ${new Date(coupon.valid_until).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "";
  return `${coupon.code} — ${discount}${minimum}${validity}`;
}

export function buildCustomerBenefitsMessage(intent: WhatsAppBotIntent, benefits: CustomerBenefits, menuUrl: string) {
  const promotions = benefits.promotions.length > 0
    ? `Ofertas ativas no cardápio:\n${benefits.promotions.map((promotion) => `${promotion.productName} por ${money(promotion.promotionalPriceCents)}${promotion.label ? ` — ${promotion.label}` : ""}`).join("\n")}`
    : "Não encontrei promoção de produto ativa agora.";
  if (intent === "promotions") return `${promotions}\nConfira os detalhes no cardápio: ${menuUrl}`;
  if (!benefits.identified) return `Ainda não consegui vincular este WhatsApp a um cliente desta loja com segurança. Você pode conferir seus dados no checkout: ${menuUrl}\nSe acredita que já deveria ter um benefício, escreva “falar com atendente”.`;
  if (!benefits.available) return `O programa de benefícios não está ativo nesta loja no momento. Confira as ofertas atuais no cardápio: ${menuUrl}`;

  const cashback = benefits.cashbackEnabled
    ? `Cashback disponível: ${money(benefits.cashbackBalanceCents)}.`
    : "Cashback não está ativo nesta loja.";
  const pointsValue = benefits.loyaltyBalancePoints * benefits.loyaltyRedeemCentsPerPoint;
  const points = benefits.loyaltyEnabled
    ? `Pontos disponíveis: ${benefits.loyaltyBalancePoints}${pointsValue > 0 ? ` (equivalem a até ${money(pointsValue)})` : ""}.`
    : "Pontos não estão ativos nesta loja.";
  const coupons = benefits.coupons.length > 0
    ? `Cupons disponíveis agora:\n${benefits.coupons.slice(0, 5).map(couponLine).join("\n")}`
    : "Não encontrei cupom elegível para você agora.";
  const checkout = `A aplicação final depende dos itens e do total do pedido. Confira e aplique com segurança no checkout: ${menuUrl}`;

  if (intent === "cashback") return `${cashback}\n${checkout}`;
  if (intent === "points") return `${points}\n${checkout}`;
  if (intent === "coupons") return `${coupons}\n${checkout}`;
  return `${cashback}\n${points}\n${coupons}\n${promotions}\n\n${checkout}`;
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
  visibleStage?: WorkflowStage | null;
}) {
  const order = orderStatusLabels[input.orderStatus] ?? "em atualização";
  const production = productionStatusLabels[input.productionStatus] ?? "em atualização";
  const fulfillment = fulfillmentStatusLabels[input.fulfillmentStatus] ?? "em atualização";
  const link = input.trackingUrl ? `\nAcompanhe os detalhes com segurança: ${input.trackingUrl}` : "";
  if (input.orderStatus === "canceled" || input.orderStatus === "rejected") {
    return `Achei seu pedido #${input.displayNumber} 😊\nPedido #${input.displayNumber}: ${order}.${link}`;
  }
  if (input.visibleStage) {
    return `Achei seu pedido #${input.displayNumber} 😊\nEtapa atual: ${workflowStageLabels[input.visibleStage]}.${link}`;
  }
  return `Achei seu pedido #${input.displayNumber} 😊\nPedido #${input.displayNumber}: ${order}. Preparo: ${production}. Entrega/retirada: ${fulfillment}.${link}`;
}

export const TRACKING_CODE_PROMPT = "Claro! Me manda o número do seu pedido que aparece na confirmação 😊 Pode enviar só o número, por exemplo: 42. Se quiser voltar, é só escrever menu.";
export const TRACKING_NOT_FOUND_MESSAGE = "Hmm, não encontrei esse pedido ligado ao seu número neste restaurante. Confira o código e tente de novo. Se preferir, escreva \"falar com atendente\" que eu chamo a equipe para você.";
