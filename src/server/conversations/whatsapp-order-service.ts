import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CartService } from "@/server/cart/cart-service";
import { CheckoutError, CheckoutService } from "@/server/checkout/checkout-service";
import { OrderNotificationContextService } from "@/server/conversations/order-notification-context-service";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { OrderService } from "@/server/orders/order-service";
import { PricingError } from "@/server/pricing/pricing-service";

export type WhatsAppOrderStep =
  | "order_items"
  | "order_name"
  | "order_fulfillment"
  | "order_address"
  | "order_payment"
  | "order_confirmation";

export type WhatsAppOrderContext = {
  channel: "whatsapp_order";
  version: 1;
  cartToken?: string;
  customerName?: string;
  fulfillment?: "delivery" | "pickup";
  paymentMethod?: "cash" | "credit_card" | "debit_card";
};

export type WhatsAppOrderHandleResult = {
  handled: true;
  body: string;
  nextStep: WhatsAppOrderStep | "menu";
  context: WhatsAppOrderContext | null;
};

type Input = {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
  contactName: string | null;
  contactPhone: string;
  text: string;
  step: WhatsAppOrderStep;
  context: unknown;
};

type ParsedItem = { quantity: number; query: string };
type ProductCandidate = { id: string; name: string; description: string | null; price_cents: number; promotional_price_cents: number | null };

const paymentLabels: Record<string, string> = {
  cash: "dinheiro",
  credit_card: "cartão de crédito",
  debit_card: "cartão de débito",
};

const productStopWords = new Set([
  "a", "as", "o", "os", "de", "da", "das", "do", "dos", "com", "em", "no", "na", "nos", "nas",
  "un", "und", "unid", "unidade", "unidades", "uma", "um", "pra", "para",
]);

function money(cents: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents ?? 0) / 100);
}

function normalizeContext(value: unknown): WhatsAppOrderContext {
  if (!value || typeof value !== "object") return { channel: "whatsapp_order", version: 1 };
  const raw = value as Record<string, unknown>;
  return {
    channel: "whatsapp_order",
    version: 1,
    cartToken: typeof raw.cartToken === "string" ? raw.cartToken : undefined,
    customerName: typeof raw.customerName === "string" ? raw.customerName : undefined,
    fulfillment: raw.fulfillment === "delivery" || raw.fulfillment === "pickup" ? raw.fulfillment : undefined,
    paymentMethod: raw.paymentMethod === "cash" || raw.paymentMethod === "credit_card" || raw.paymentMethod === "debit_card" ? raw.paymentMethod : undefined,
  };
}

function cleanOrderSegment(raw: string) {
  return raw
    .replace(/\b(oi|ola|olá|quero|gostaria|pedido|pedir|preciso de|me ve|me vê|manda|mandar|pode ser)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLeadingQuantity(segment: string) {
  const numeric = segment.match(/^(\d{1,4})\s*(?:x|un|unid(?:ade)?s?)?\s+(.+)$/i);
  if (numeric) return { quantity: Number(numeric[1]!), query: numeric[2]!.replace(/^[xX]\s*/, "").trim() };
  const word = segment.match(/^(?:um|uma)\s+(.+)$/i);
  if (word) return { quantity: 1, query: word[1]!.trim() };
  return null;
}

export function looksLikeWhatsAppOrderItems(text: string | null | undefined) {
  if (!text) return false;
  return text.split(/[\n;,]+/).some((segment) => Boolean(parseLeadingQuantity(cleanOrderSegment(segment))));
}

export function parseWhatsAppOrderItems(text: string): ParsedItem[] {
  const segments = text.split(/[\n;,]+/).map((item) => item.trim()).filter(Boolean);
  const parsed: ParsedItem[] = [];
  for (const raw of segments) {
    const match = parseLeadingQuantity(cleanOrderSegment(raw));
    if (!match) continue;
    if (match.quantity > 0 && match.quantity <= 99 && match.query.length >= 2) parsed.push(match);
  }
  return parsed;
}

function hasUnsupportedQuantity(text: string) {
  return text.split(/[\n;,]+/).some((segment) => {
    const match = parseLeadingQuantity(cleanOrderSegment(segment));
    return Boolean(match && match.quantity > 99);
  });
}

function isYes(text: string) {
  const normalized = normalizeBotInput(text);
  return ["sim", "s", "confirmar", "confirmo", "pode confirmar", "fechar pedido", "finalizar"].includes(normalized);
}

function isNo(text: string) {
  const normalized = normalizeBotInput(text);
  return ["nao", "n", "cancelar", "cancela", "desistir"].includes(normalized);
}

function parseFulfillment(text: string): "delivery" | "pickup" | null {
  const normalized = normalizeBotInput(text);
  if (normalized.includes("entrega") || normalized.includes("delivery") || normalized === "1") return "delivery";
  if (normalized.includes("retirada") || normalized.includes("retirar") || normalized.includes("buscar") || normalized === "2") return "pickup";
  return null;
}

function parsePayment(text: string): "cash" | "credit_card" | "debit_card" | null {
  const normalized = normalizeBotInput(text);
  if (normalized === "1" || normalized.includes("dinheiro")) return "cash";
  if (normalized === "2" || normalized.includes("credito")) return "credit_card";
  if (normalized === "3" || normalized.includes("debito")) return "debit_card";
  return null;
}

function parseAddress(text: string) {
  const parts = text.split(",").map((item) => item.trim()).filter(Boolean);
  if (parts.length < 5) return null;
  const street = parts[0]!;
  const number = parts[1]!;
  const district = parts[2]!;
  const city = parts[3]!;
  const state = parts[4]!;
  const rest = parts.slice(5);
  return {
    postalCode: "",
    street,
    number,
    district,
    city,
    state: state.toUpperCase().slice(0, 2),
    complement: rest.length ? rest.join(", ") : null,
    reference: null,
  };
}

function normalizeProductText(value: string) {
  return normalizeBotInput(value)
    .replace(/(\d+)\s*(?:litro|litros|lt|lts)\b/g, "$1l")
    .replace(/(\d+)\s*(?:mililitro|mililitros|ml)\b/g, "$1ml")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productTokens(value: string) {
  return normalizeProductText(value)
    .split(" ")
    .filter((token) => token.length > 0 && !productStopWords.has(token));
}

function productMatchScore(query: string, candidate: ProductCandidate) {
  const queryTokens = [...new Set(productTokens(query))];
  const nameTokens = new Set(productTokens(candidate.name));
  if (queryTokens.length === 0) return 0;

  const queryNumbers = queryTokens.filter((token) => /^\d/.test(token));
  if (queryNumbers.some((number) => !nameTokens.has(number))) return 0;

  const matched = queryTokens.filter((token) => nameTokens.has(token)).length;
  const coverage = matched / queryTokens.length;
  const nameCoverage = matched / Math.max(nameTokens.size, 1);
  const normalizedQuery = normalizeProductText(query);
  const normalizedName = normalizeProductText(candidate.name);
  const directBonus = normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName) ? 0.22 : 0;
  return Math.min(1, coverage * 0.72 + nameCoverage * 0.28 + directBonus);
}

async function findProduct(organizationId: string, storeId: string, query: string) {
  const admin = createAdminClient();
  const terms = productTokens(query).filter((token) => token.length >= 3 && !/^\d/.test(token)).slice(-4);
  const filters = terms.flatMap((term) => [`name.ilike.%${term}%`, `description.ilike.%${term}%`]);
  let productQuery = admin.from("products")
    .select("id, name, description, price_cents, promotional_price_cents")
    .eq("organization_id", organizationId)
    .eq("store_id", storeId)
    .eq("active", true)
    .eq("availability", "available")
    .is("deleted_at", null)
    .order("name")
    .limit(40);
  if (filters.length > 0) productQuery = productQuery.or(filters.join(","));

  const { data, error } = await productQuery;
  if (error) throw error;
  const rows = (data ?? []) as ProductCandidate[];
  if (rows.length === 0) return { kind: "missing" as const, options: [] as string[] };

  const normalizedQuery = normalizeProductText(query);
  const exact = rows.find((row) => normalizeProductText(row.name) === normalizedQuery);
  if (exact) return { kind: "found" as const, product: exact };

  const ranked = rows
    .map((product) => ({ product, score: productMatchScore(query, product) }))
    .filter((item) => item.score >= 0.42)
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, "pt-BR"));

  const best = ranked[0];
  const second = ranked[1];
  if (best && best.score >= 0.74 && (!second || best.score - second.score >= 0.12)) {
    return { kind: "found" as const, product: best.product };
  }
  if (ranked.length > 0) {
    return { kind: "ambiguous" as const, options: ranked.slice(0, 5).map((item) => item.product.name) };
  }
  return { kind: "missing" as const, options: rows.slice(0, 5).map((row) => row.name) };
}

async function addRequestedItems(input: Input, items: ParsedItem[]) {
  let token: string | null = null;
  const added: Array<{ name: string; quantity: number; lineTotalCents: number }> = [];
  for (const request of items) {
    const found = await findProduct(input.organizationId, input.storeId, request.query);
    if (found.kind === "missing") {
      const suggestion = found.options.length > 0 ? ` Talvez você queira: ${found.options.join(", ")}.` : "";
      return { ok: false as const, message: `Ainda não consegui identificar “${request.query}” com segurança.${suggestion} Envie o nome mais parecido com o cardápio ou digite 1 para abrir o cardápio online.` };
    }
    if (found.kind === "ambiguous") {
      return { ok: false as const, message: `Encontrei algumas opções parecidas com “${request.query}”:\n${found.options.map((name, index) => `${index + 1} — ${name}`).join("\n")}\n\nResponda novamente com o nome da opção desejada.` };
    }
    const product = found.product;
    try {
      const result = await CartService.addItem({
        storeSlug: input.storeSlug,
        productId: product.id,
        quantity: request.quantity,
        note: "Pedido iniciado pelo WhatsApp",
        modifierIds: [],
        modifierSelections: [],
        gasSaleMode: null,
      }, token);
      token = result.token;
      const unit = Number(product.promotional_price_cents ?? product.price_cents);
      added.push({ name: product.name, quantity: request.quantity, lineTotalCents: unit * request.quantity });
    } catch (error) {
      if (error instanceof PricingError && error.code === "invalid_modifiers") {
        return { ok: false as const, message: `Encontrei “${product.name}”, mas esse item precisa escolher sabor, tamanho ou adicional. Por segurança, ainda não vou adivinhar essa escolha. Digite 1 para montar esse produto no cardápio online ou escolha um item sem opções obrigatórias.` };
      }
      throw error;
    }
  }
  if (!token || added.length === 0) return { ok: false as const, message: "Não consegui montar o pedido. Você pode escrever de forma natural, por exemplo: 2 Coxinhas ou 1 copo de 13 mini churros." };
  return { ok: true as const, token, added };
}

async function paymentOptions(organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("store_payment_methods")
    .select("method")
    .eq("organization_id", organizationId)
    .eq("store_id", storeId)
    .eq("enabled", true)
    .in("method", ["cash", "credit_card", "debit_card"])
    .order("sort_order");
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.method));
}

function paymentPrompt(options: Set<string>) {
  const lines = [
    options.has("cash") ? "1 — Dinheiro" : null,
    options.has("credit_card") ? "2 — Cartão de crédito" : null,
    options.has("debit_card") ? "3 — Cartão de débito" : null,
  ].filter(Boolean);
  return lines.length > 0 ? `Como será o pagamento?\n${lines.join("\n")}` : "Não há uma forma de pagamento compatível com o pedido pelo WhatsApp. Digite 3 para falar com a equipe.";
}

async function reviewSummary(storeSlug: string, cartToken: string, context: WhatsAppOrderContext) {
  const loaded = await CheckoutService.load(storeSlug, cartToken);
  const total = Number(loaded.cart.total_cents);
  const itemLines = loaded.cart.items.map((item) => `${item.quantity}x ${item.product_name_snapshot} — ${money(item.line_total_cents)}`);
  const receive = context.fulfillment === "delivery" ? "Entrega" : "Retirada";
  const payment = context.paymentMethod ? paymentLabels[context.paymentMethod] : "não informado";
  return `Confira seu pedido:\n${itemLines.join("\n")}\n\nRecebimento: ${receive}\nPagamento: ${payment}\nTotal: ${money(total)}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.`;
}

export function isWhatsAppOrderStep(step: string | null | undefined): step is WhatsAppOrderStep {
  return ["order_items", "order_name", "order_fulfillment", "order_address", "order_payment", "order_confirmation"].includes(step ?? "");
}

export function whatsappOrderStartMessage(storeName: string) {
  return `Vamos montar seu pedido pelo WhatsApp em ${storeName}.\n\nPode escrever do seu jeito, sempre informando a quantidade. Exemplos:\n2 Coxinhas de frango\n1 Refrigerante lata\n1 copo de 13 unidades de mini churros\n\nEu só criarei o pedido depois que você conferir e responder SIM.`;
}

export class WhatsAppOrderService {
  static async handle(input: Input): Promise<WhatsAppOrderHandleResult> {
    const context = normalizeContext(input.context);

    if (input.step === "order_items") {
      if (hasUnsupportedQuantity(input.text)) {
        return { handled: true, body: "Por segurança, cada linha pode ter no máximo 99 unidades. Se a loja vende pacotes/centos, use o nome do pacote que aparece no cardápio. Exemplo: 2 Cento de salgados.", nextStep: "order_items", context };
      }
      const items = parseWhatsAppOrderItems(input.text);
      if (items.length === 0) {
        return { handled: true, body: "Me diga a quantidade e o produto. Pode escrever naturalmente, por exemplo:\n2 Coxinhas de frango\n1 copo de 13 mini churros", nextStep: "order_items", context };
      }
      const result = await addRequestedItems(input, items);
      if (!result.ok) return { handled: true, body: result.message, nextStep: "order_items", context };
      const nextContext = { ...context, cartToken: result.token };
      const customerName = (input.contactName ?? "").trim();
      const itemsText = result.added.map((item) => `${item.quantity}x ${item.name}`).join("\n");
      if (customerName.length < 2) {
        return { handled: true, body: `Adicionei:\n${itemsText}\n\nQual é o seu nome?`, nextStep: "order_name", context: nextContext };
      }
      await CheckoutService.saveIdentity(input.storeSlug, result.token, { name: customerName, phone: input.contactPhone, email: null });
      return { handled: true, body: `Adicionei:\n${itemsText}\n\nComo você quer receber?\n1 — Entrega\n2 — Retirada`, nextStep: "order_fulfillment", context: { ...nextContext, customerName } };
    }

    if (!context.cartToken) {
      return { handled: true, body: "Seu pedido em andamento expirou. Vamos começar de novo. Envie os itens com quantidade, por exemplo: 2 Coxinha.", nextStep: "order_items", context: { channel: "whatsapp_order", version: 1 } };
    }

    if (input.step === "order_name") {
      const customerName = input.text.trim();
      if (customerName.length < 2 || customerName.length > 120) {
        return { handled: true, body: "Digite seu nome para eu continuar o pedido.", nextStep: "order_name", context };
      }
      await CheckoutService.saveIdentity(input.storeSlug, context.cartToken, { name: customerName, phone: input.contactPhone, email: null });
      return { handled: true, body: "Como você quer receber?\n1 — Entrega\n2 — Retirada", nextStep: "order_fulfillment", context: { ...context, customerName } };
    }

    if (input.step === "order_fulfillment") {
      const fulfillment = parseFulfillment(input.text);
      if (!fulfillment) return { handled: true, body: "Escolha uma opção:\n1 — Entrega\n2 — Retirada", nextStep: "order_fulfillment", context };
      try {
        await CheckoutService.saveFulfillment(input.storeSlug, context.cartToken, fulfillment);
      } catch (error) {
        if (error instanceof CheckoutError) return { handled: true, body: `${error.message}. Escolha outra opção ou digite menu.`, nextStep: "order_fulfillment", context };
        throw error;
      }
      if (fulfillment === "delivery") {
        return { handled: true, body: "Envie o endereço neste formato:\nRua, número, bairro, cidade, UF\n\nExemplo: Rua das Flores, 123, Centro, Americana, SP", nextStep: "order_address", context: { ...context, fulfillment } };
      }
      const options = await paymentOptions(input.organizationId, input.storeId);
      return { handled: true, body: paymentPrompt(options), nextStep: "order_payment", context: { ...context, fulfillment } };
    }

    if (input.step === "order_address") {
      const address = parseAddress(input.text);
      if (!address) return { handled: true, body: "Não consegui entender o endereço. Envie assim:\nRua, número, bairro, cidade, UF", nextStep: "order_address", context };
      try {
        const quote = await CheckoutService.saveAddress(input.storeSlug, context.cartToken, address);
        const options = await paymentOptions(input.organizationId, input.storeId);
        return { handled: true, body: `Endereço atendido. Taxa de entrega: ${money(quote.feeCents)}.\n\n${paymentPrompt(options)}`, nextStep: "order_payment", context };
      } catch (error) {
        if (error instanceof CheckoutError) return { handled: true, body: `${error.message}. Confira o endereço e envie novamente ou digite 3 para falar com a equipe.`, nextStep: "order_address", context };
        throw error;
      }
    }

    if (input.step === "order_payment") {
      const method = parsePayment(input.text);
      if (!method) return { handled: true, body: "Escolha a forma de pagamento informada acima pelo número ou pelo nome.", nextStep: "order_payment", context };
      const options = await paymentOptions(input.organizationId, input.storeId);
      if (!options.has(method)) return { handled: true, body: "Essa forma de pagamento não está ativa nesta loja. Escolha outra opção.", nextStep: "order_payment", context };
      await CheckoutService.savePayment(input.storeSlug, context.cartToken, { method, customPaymentMethodId: null, cashChangeForCents: null });
      const nextContext = { ...context, paymentMethod: method };
      return { handled: true, body: await reviewSummary(input.storeSlug, context.cartToken, nextContext), nextStep: "order_confirmation", context: nextContext };
    }

    if (input.step === "order_confirmation") {
      if (isNo(input.text)) return { handled: true, body: "Pedido cancelado. Nada foi enviado para a loja. Para começar outro pedido, digite 7. Para ver as opções, digite menu.", nextStep: "menu", context: null };
      if (!isYes(input.text)) return { handled: true, body: "Responda SIM para confirmar o pedido ou NÃO para cancelar.", nextStep: "order_confirmation", context };
      const result = await OrderService.createFromCheckout(input.storeSlug, context.cartToken);
      const admin = createAdminClient();
      const { error: channelError } = await admin.from("orders")
        .update({ channel: "whatsapp", updated_at: new Date().toISOString() })
        .eq("id", result.order_id)
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId);
      if (channelError) throw channelError;
      await OrderNotificationContextService.capture(result.order_id, result.accessToken);
      scheduleOrderWhatsAppNotifications("checkout.order_created");
      return { handled: true, body: `Pedido #${result.display_number} criado com sucesso pelo WhatsApp ✅\nA loja recebeu o pedido e agora ele seguirá o fluxo normal do PedeAqui.\n\nPara acompanhar, digite 2.`, nextStep: "menu", context: null };
    }

    return { handled: true, body: "Vamos começar novamente. Envie os itens com quantidade.", nextStep: "order_items", context: { channel: "whatsapp_order", version: 1 } };
  }
}
