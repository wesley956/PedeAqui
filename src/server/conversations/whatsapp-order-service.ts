import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CartService } from "@/server/cart/cart-service";
import { CheckoutError, CheckoutService } from "@/server/checkout/checkout-service";
import { paymentMethodLabels, paymentMethodSchema, type PaymentMethod } from "@/server/checkout/schemas";
import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { looseTokenSimilarity, normalizeProductLanguage } from "@/server/conversations/language-normalization";
import { parseOrderComposition, resolvePendingChoiceReference, type OrderComposition } from "@/server/conversations/whatsapp-order-context";
import {
  buildWhatsAppPaymentPrompt,
  resolveWhatsAppPaymentSelection,
} from "@/server/conversations/whatsapp-payment-methods";
import { OrderNotificationContextService } from "@/server/conversations/order-notification-context-service";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { OrderService } from "@/server/orders/order-service";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import { PricingError } from "@/server/pricing/pricing-service";

export type WhatsAppOrderStep = "order_items" | "order_name" | "order_fulfillment" | "order_address" | "order_payment" | "order_confirmation";

type PendingProductChoice = { productId: string; name: string; quantity: number };
type PendingComposition = { productId: string; name: string; quantity: number; groupId: string; groupName: string; distributionTotal: number };

export type WhatsAppOrderContext = {
  channel: "whatsapp_order";
  version: 1;
  cartToken?: string;
  customerName?: string;
  fulfillment?: "delivery" | "pickup";
  paymentMethod?: PaymentMethod;
  customPaymentMethodId?: string;
  paymentLabel?: string;
  awaitingPixEmail?: boolean;
  pendingChoices?: PendingProductChoice[];
  pendingComposition?: PendingComposition;
};

export type WhatsAppOrderHandleResult = { handled: true; body: string; nextStep: WhatsAppOrderStep | "menu"; context: WhatsAppOrderContext | null };

type Input = { organizationId: string; storeId: string; storeSlug: string; storeName: string; contactName: string | null; contactPhone: string; text: string; step: WhatsAppOrderStep; context: unknown };
type ParsedItem = { quantity: number; query: string };
type ProductCandidate = { id: string; name: string; description: string | null; price_cents: number; promotional_price_cents: number | null };
type ModifierRow = { id: string; name: string };
type CompositionProfile = PendingComposition & { modifiers: ModifierRow[] };

const productStopWords = new Set(["a", "as", "o", "os", "de", "da", "das", "do", "dos", "com", "em", "no", "na", "nos", "nas", "un", "und", "unid", "unidade", "unidades", "uma", "um", "pra", "para"]);

function money(cents: number | string | null | undefined) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents ?? 0) / 100); }

function normalizeContext(value: unknown): WhatsAppOrderContext {
  if (!value || typeof value !== "object") return { channel: "whatsapp_order", version: 1 };
  const raw = value as Record<string, unknown>;
  const choices = Array.isArray(raw.pendingChoices) ? raw.pendingChoices.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return typeof item.productId === "string" && typeof item.name === "string" && typeof item.quantity === "number"
      ? [{ productId: item.productId, name: item.name, quantity: item.quantity }] : [];
  }) : undefined;
  let pendingComposition: PendingComposition | undefined;
  if (raw.pendingComposition && typeof raw.pendingComposition === "object") {
    const item = raw.pendingComposition as Record<string, unknown>;
    if (typeof item.productId === "string" && typeof item.name === "string" && typeof item.quantity === "number" && typeof item.groupId === "string" && typeof item.groupName === "string" && typeof item.distributionTotal === "number") {
      pendingComposition = { productId: item.productId, name: item.name, quantity: item.quantity, groupId: item.groupId, groupName: item.groupName, distributionTotal: item.distributionTotal };
    }
  }
  const paymentMethod = paymentMethodSchema.safeParse(raw.paymentMethod);
  return {
    channel: "whatsapp_order", version: 1,
    cartToken: typeof raw.cartToken === "string" ? raw.cartToken : undefined,
    customerName: typeof raw.customerName === "string" ? raw.customerName : undefined,
    fulfillment: raw.fulfillment === "delivery" || raw.fulfillment === "pickup" ? raw.fulfillment : undefined,
    paymentMethod: paymentMethod.success ? paymentMethod.data : undefined,
    customPaymentMethodId: typeof raw.customPaymentMethodId === "string" ? raw.customPaymentMethodId : undefined,
    paymentLabel: typeof raw.paymentLabel === "string" ? raw.paymentLabel : undefined,
    awaitingPixEmail: raw.awaitingPixEmail === true ? true : undefined,
    pendingChoices: choices?.length ? choices : undefined,
    pendingComposition,
  };
}

function cleanOrderSegment(raw: string) {
  return normalizeBotInput(raw).replace(/\b(oi|ola|quero|gostaria|pedido|pedir|preciso de|me ve|manda|mandar|pode ser)\b/gi, " ").replace(/\s+/g, " ").trim();
}
function parseLeadingQuantity(segment: string) {
  const numeric = segment.match(/^(\d{1,4})\s*(?:x|un|unid(?:ade)?s?)?\s+(.+)$/i);
  if (numeric) return { quantity: Number(numeric[1]!), query: numeric[2]!.replace(/^[xX]\s*/, "").trim() };
  const word = segment.match(/^(?:um|uma)\s+(.+)$/i);
  return word ? { quantity: 1, query: word[1]!.trim() } : null;
}
export function looksLikeWhatsAppOrderItems(text: string | null | undefined) { return Boolean(text && text.split(/[\n;,]+/).some((segment) => parseLeadingQuantity(cleanOrderSegment(segment)))); }
export function parseWhatsAppOrderItems(text: string): ParsedItem[] {
  return text.split(/[\n;,]+/).map((item) => parseLeadingQuantity(cleanOrderSegment(item))).filter((item): item is ParsedItem => Boolean(item && item.quantity > 0 && item.quantity <= 99 && item.query.length >= 2));
}
function hasUnsupportedQuantity(text: string) { return text.split(/[\n;,]+/).some((segment) => { const item = parseLeadingQuantity(cleanOrderSegment(segment)); return Boolean(item && item.quantity > 99); }); }
function isYes(text: string) { return ["sim", "s", "confirmar", "confirmo", "pode confirmar", "fechar pedido", "finalizar", "fechou", "beleza", "ok"].includes(normalizeBotInput(text)); }
function isNo(text: string) { return ["nao", "n", "cancelar", "cancela", "desistir"].includes(normalizeBotInput(text)); }
function parseFulfillment(text: string): "delivery" | "pickup" | null { const n = normalizeBotInput(text); if (n.includes("entrega") || n === "1") return "delivery"; if (n.includes("retirada") || n.includes("buscar") || n === "2") return "pickup"; return null; }
function parseAddress(text: string) {
  const parts = text.split(",").map((item) => item.trim()).filter(Boolean); if (parts.length < 5) return null;
  return { postalCode: "", street: parts[0]!, number: parts[1]!, district: parts[2]!, city: parts[3]!, state: parts[4]!.toUpperCase().slice(0, 2), complement: parts.length > 5 ? parts.slice(5).join(", ") : null, reference: null };
}

function productTokens(value: string) { return normalizeProductLanguage(value).split(" ").filter((token) => token && !productStopWords.has(token)); }
function productMatchScore(query: string, candidate: ProductCandidate) {
  const queryTokens = [...new Set(productTokens(query))]; const nameTokens = [...new Set(productTokens(candidate.name))]; if (!queryTokens.length) return 0;
  const queryNumbers = queryTokens.filter((token) => /^\d/.test(token)); if (queryNumbers.some((number) => !nameTokens.includes(number))) return 0;
  const perToken = queryTokens.map((token) => Math.max(...nameTokens.map((nameToken) => looseTokenSimilarity(token, nameToken)), 0));
  const coverage = perToken.reduce((sum, score) => sum + score, 0) / queryTokens.length;
  const direct = normalizeProductLanguage(candidate.name).includes(normalizeProductLanguage(query)) || normalizeProductLanguage(query).includes(normalizeProductLanguage(candidate.name)) ? 0.18 : 0;
  return Math.min(1, coverage * 0.82 + direct);
}

async function findProduct(organizationId: string, storeId: string, query: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("products").select("id, name, description, price_cents, promotional_price_cents").eq("organization_id", organizationId).eq("store_id", storeId).eq("active", true).eq("availability", "available").is("deleted_at", null).order("name").limit(100);
  if (error) throw error;
  const rows = (data ?? []) as ProductCandidate[]; if (!rows.length) return { kind: "missing" as const, options: [] as ProductCandidate[] };
  const nq = normalizeProductLanguage(query); const exact = rows.find((row) => normalizeProductLanguage(row.name) === nq); if (exact) return { kind: "found" as const, product: exact };
  const ranked = rows.map((product) => ({ product, score: productMatchScore(query, product) })).filter((item) => item.score >= 0.48).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "pt-BR"));
  const best = ranked[0], second = ranked[1];
  if (best && best.score >= 0.76 && (!second || best.score - second.score >= 0.13)) return { kind: "found" as const, product: best.product };
  if (ranked.length) return { kind: "ambiguous" as const, options: ranked.slice(0, 5).map((item) => item.product) };
  return { kind: "missing" as const, options: rows.slice(0, 5) };
}

async function loadCompositionProfile(input: Pick<Input, "organizationId" | "storeId">, productId: string): Promise<CompositionProfile | null> {
  const admin = createAdminClient();
  const { data: links, error: linkError } = await admin.from("product_modifier_groups").select("modifier_group_id").eq("organization_id", input.organizationId).eq("store_id", input.storeId).eq("product_id", productId).order("sort_order");
  if (linkError) throw linkError; const groupIds = (links ?? []).map((row) => row.modifier_group_id); if (!groupIds.length) return null;
  const { data: groups, error: groupError } = await admin.from("modifier_groups").select("id, name, selection_mode, distribution_total, active, deleted_at").eq("organization_id", input.organizationId).eq("store_id", input.storeId).in("id", groupIds).eq("active", true).is("deleted_at", null);
  if (groupError) throw groupError;
  const group = (groups ?? []).find((row) => row.selection_mode === "equal_split_options" && Number.isInteger(row.distribution_total) && Number(row.distribution_total) > 0); if (!group) return null;
  const [{ data: product, error: productError }, { data: modifiers, error: modifierError }] = await Promise.all([
    admin.from("products").select("id, name").eq("organization_id", input.organizationId).eq("store_id", input.storeId).eq("id", productId).maybeSingle(),
    admin.from("modifiers").select("id, name").eq("organization_id", input.organizationId).eq("store_id", input.storeId).eq("modifier_group_id", group.id).eq("active", true).is("deleted_at", null).order("sort_order"),
  ]);
  if (productError) throw productError; if (modifierError) throw modifierError; if (!product) return null;
  return { productId, name: product.name, quantity: 1, groupId: group.id, groupName: group.name, distributionTotal: Number(group.distribution_total), modifiers: (modifiers ?? []) as ModifierRow[] };
}

function modifierScore(label: string, name: string) {
  const query = productTokens(label), target = productTokens(name); if (!query.length || !target.length) return 0;
  const tokenScore = query.reduce((sum, token) => sum + Math.max(...target.map((candidate) => looseTokenSimilarity(token, candidate))), 0) / query.length;
  const nq = normalizeProductLanguage(label), nn = normalizeProductLanguage(name); return Math.min(1, tokenScore * 0.85 + (nn.includes(nq) || nq.includes(nn) ? 0.15 : 0));
}

function resolveCompositionSelections(composition: OrderComposition, profile: CompositionProfile) {
  if (composition.total !== profile.distributionTotal) return { ok: false as const, reason: "total" as const };
  const selections: Array<{ modifierId: string; quantity: number; name: string }> = [];
  for (const part of composition.parts) {
    const normalizedPart = normalizeProductLanguage(part.normalizedLabel);
    const exact = profile.modifiers.find((modifier) => normalizeProductLanguage(modifier.name) === normalizedPart);
    const ranked = profile.modifiers.map((modifier) => ({ modifier, score: modifierScore(part.normalizedLabel, modifier.name) })).sort((a, b) => b.score - a.score);
    const best = exact ? { modifier: exact, score: 1 } : ranked[0];
    const second = exact ? undefined : ranked[1];
    if (!best || best.score < 0.68 || (second && best.score - second.score < 0.08)) return { ok: false as const, reason: "modifier" as const, label: part.label, suggestions: ranked.slice(0, 3).map((item) => item.modifier.name) };
    const existing = selections.find((item) => item.modifierId === best.modifier.id);
    if (existing) existing.quantity += part.quantity; else selections.push({ modifierId: best.modifier.id, quantity: part.quantity, name: best.modifier.name });
  }
  return { ok: true as const, selections };
}

async function findProfileForComposition(input: Input, composition: OrderComposition): Promise<CompositionProfile | null> {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("modifier_groups").select("id, name, distribution_total").eq("organization_id", input.organizationId).eq("store_id", input.storeId).eq("selection_mode", "equal_split_options").eq("distribution_total", composition.total).eq("active", true).is("deleted_at", null);
  if (error) throw error; if (!groups?.length) return null;
  const candidates: CompositionProfile[] = [];
  for (const group of groups) {
    const { data: links, error: linksError } = await admin.from("product_modifier_groups").select("product_id").eq("organization_id", input.organizationId).eq("store_id", input.storeId).eq("modifier_group_id", group.id);
    if (linksError) throw linksError;
    for (const link of links ?? []) {
      const profile = await loadCompositionProfile(input, link.product_id); if (!profile || profile.groupId !== group.id) continue;
      const resolved = resolveCompositionSelections(composition, profile); if (resolved.ok) candidates.push(profile);
    }
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

async function addComposition(input: Input, context: WhatsAppOrderContext, profile: CompositionProfile, composition: OrderComposition) {
  const resolved = resolveCompositionSelections(composition, profile);
  if (!resolved.ok) {
    if (resolved.reason === "total") {
      const diff = profile.distributionTotal - composition.total;
      return { ok: false as const, message: diff > 0 ? `Você informou ${composition.total} de ${profile.distributionTotal} unidades. Faltam ${diff}.` : `Você informou ${composition.total} unidades, mas essa caixa comporta ${profile.distributionTotal}. Retire ${Math.abs(diff)}.` };
    }
    const suggestions = resolved.suggestions?.length ? ` Opções parecidas: ${resolved.suggestions.join(", ")}.` : "";
    return { ok: false as const, message: `Não consegui identificar o sabor “${resolved.label}” com segurança.${suggestions} Escreva o sabor como aparece no cardápio.` };
  }
  const result = await CartService.addItem({ storeSlug: input.storeSlug, productId: profile.productId, quantity: profile.quantity, note: `Composição pelo WhatsApp: ${resolved.selections.map((item) => `${item.quantity} ${item.name}`).join(", ")}`, modifierIds: [], modifierSelections: resolved.selections.map((item) => ({ modifierId: item.modifierId, quantity: item.quantity })), gasSaleMode: null }, context.cartToken ?? null);
  return { ok: true as const, token: result.token, added: [{ name: profile.name, quantity: profile.quantity }] };
}

async function addPlainProduct(input: Input, context: WhatsAppOrderContext, product: ProductCandidate, quantity: number) {
  const profile = await loadCompositionProfile(input, product.id);
  if (profile) return { kind: "composition_needed" as const, profile: { ...profile, quantity } };
  try {
    const result = await CartService.addItem({ storeSlug: input.storeSlug, productId: product.id, quantity, note: "Pedido iniciado pelo WhatsApp", modifierIds: [], modifierSelections: [], gasSaleMode: null }, context.cartToken ?? null);
    return { kind: "added" as const, token: result.token, added: [{ name: product.name, quantity }] };
  } catch (error) {
    if (error instanceof PricingError && error.code === "invalid_modifiers") return { kind: "needs_options" as const, message: `Encontrei “${product.name}”, mas ele exige uma escolha de sabor, tamanho ou adicional que ainda não consigo preencher com segurança. Diga a opção desejada ou digite 1 para abrir o cardápio.` };
    throw error;
  }
}

async function continueAfterAdded(input: Input, context: WhatsAppOrderContext, token: string, added: Array<{ name: string; quantity: number }>): Promise<WhatsAppOrderHandleResult> {
  const cleanContext: WhatsAppOrderContext = { ...context, cartToken: token, pendingChoices: undefined, pendingComposition: undefined };
  const itemsText = added.map((item) => `${item.quantity}x ${item.name}`).join("\n"); const customerName = (input.contactName ?? "").trim();
  if (customerName.length < 2) return { handled: true, body: `Adicionei:\n${itemsText}\n\nQual é o seu nome?`, nextStep: "order_name", context: cleanContext };
  await CheckoutService.saveIdentity(input.storeSlug, token, { name: customerName, phone: input.contactPhone, email: null });
  return { handled: true, body: `Adicionei:\n${itemsText}\n\nComo você quer receber?\n1 — Entrega\n2 — Retirada`, nextStep: "order_fulfillment", context: { ...cleanContext, customerName } };
}

async function paymentOptions(organizationId: string, storeId: string) {
  return StorePaymentMethodService.listForStore(organizationId, storeId);
}
async function reviewSummary(storeSlug: string, cartToken: string, context: WhatsAppOrderContext) {
  const loaded = await CheckoutService.load(storeSlug, cartToken);
  const total = Number(loaded.cart.total_cents);
  const itemLines = loaded.cart.items.map((item) => `${item.quantity}x ${item.product_name_snapshot} — ${money(item.line_total_cents)}`);
  const paymentLabel = context.paymentLabel ?? (context.paymentMethod ? paymentMethodLabels[context.paymentMethod] : "não informado");
  return `Confira seu pedido:\n${itemLines.join("\n")}\n\nRecebimento: ${context.fulfillment === "delivery" ? "Entrega" : "Retirada"}\nPagamento: ${paymentLabel}\nTotal: ${money(total)}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.`;
}

export function isWhatsAppOrderStep(step: string | null | undefined): step is WhatsAppOrderStep { return ["order_items", "order_name", "order_fulfillment", "order_address", "order_payment", "order_confirmation"].includes(step ?? ""); }
export function whatsappOrderStartMessage(storeName: string) { return `Vamos montar seu pedido pelo WhatsApp em ${storeName}.\n\nPode escrever do seu jeito. Exemplos:\n2 Coxinhas de frango\n1 Refrigerante lata\n15 coxinhas, 10 bolinhas de queijo e 5 salsichas\n\nEu só criarei o pedido depois que você conferir e responder SIM.`; }

export class WhatsAppOrderService {
  static async handle(input: Input): Promise<WhatsAppOrderHandleResult> {
    const context = normalizeContext(input.context);
    if (input.step === "order_items") {
      if (context.pendingComposition) {
        const composition = parseOrderComposition(input.text, context.pendingComposition.distributionTotal);
        if (!composition) return { handled: true, body: `Estou montando ${context.pendingComposition.name}. Informe a composição com quantidades, por exemplo: 15 coxinhas, 10 bolinhas de queijo e 5 salsichas. O total precisa dar ${context.pendingComposition.distributionTotal}.`, nextStep: "order_items", context };
        const profile = await loadCompositionProfile(input, context.pendingComposition.productId);
        if (!profile) return { handled: true, body: "As opções desse produto mudaram no cardápio. Envie o produto novamente para eu atualizar a escolha.", nextStep: "order_items", context: { ...context, pendingComposition: undefined } };
        const result = await addComposition(input, context, { ...profile, quantity: context.pendingComposition.quantity }, composition);
        if (!result.ok) return { handled: true, body: result.message, nextStep: "order_items", context };
        return continueAfterAdded(input, context, result.token, result.added);
      }

      if (context.pendingChoices?.length) {
        const picked = resolvePendingChoiceReference(input.text, context.pendingChoices.map((item) => ({ label: item.name, value: item.productId })));
        if (picked) {
          const choice = context.pendingChoices.find((item) => item.productId === picked.value)!;
          const found = await findProduct(input.organizationId, input.storeId, choice.name);
          if (found.kind === "found") {
            const result = await addPlainProduct(input, { ...context, pendingChoices: undefined }, found.product, choice.quantity);
            if (result.kind === "composition_needed") return { handled: true, body: `Perfeito: ${result.profile.name}. Agora me diga a composição. O total precisa dar ${result.profile.distributionTotal} unidades. Exemplo: 15 coxinhas, 10 bolinhas de queijo e 5 salsichas.`, nextStep: "order_items", context: { ...context, pendingChoices: undefined, pendingComposition: result.profile } };
            if (result.kind === "needs_options") return { handled: true, body: result.message, nextStep: "order_items", context: { ...context, pendingChoices: undefined } };
            return continueAfterAdded(input, context, result.token, result.added);
          }
        }
      }

      const directComposition = parseOrderComposition(input.text);
      if (directComposition) {
        const profile = await findProfileForComposition(input, directComposition);
        if (profile) {
          const result = await addComposition(input, context, profile, directComposition);
          if (result.ok) return continueAfterAdded(input, context, result.token, result.added);
        }
      }

      if (hasUnsupportedQuantity(input.text)) return { handled: true, body: "Por segurança, cada linha pode ter no máximo 99 unidades. Se a loja vende pacotes/centos, use o nome do pacote do cardápio.", nextStep: "order_items", context };
      const items = parseWhatsAppOrderItems(input.text);
      if (!items.length) return { handled: true, body: "Me diga a quantidade e o produto. Pode escrever naturalmente, por exemplo:\n2 Coxinhas de frango\n1 caixa de 30 salgados", nextStep: "order_items", context };

      let workingContext = context;
      const added: Array<{ name: string; quantity: number }> = [];
      let token = context.cartToken;
      for (const request of items) {
        const found = await findProduct(input.organizationId, input.storeId, request.query);
        if (found.kind === "missing") return { handled: true, body: `Ainda não consegui identificar “${request.query}” com segurança. Envie o nome mais parecido com o cardápio.`, nextStep: "order_items", context: workingContext };
        if (found.kind === "ambiguous") {
          const choices = found.options.map((product) => ({ productId: product.id, name: product.name, quantity: request.quantity }));
          return { handled: true, body: `Encontrei algumas opções parecidas com “${request.query}”:\n${choices.map((item, index) => `${index + 1} — ${item.name}`).join("\n")}\n\nPode responder só o número, “a primeira”, “a segunda” ou o nome.`, nextStep: "order_items", context: { ...workingContext, pendingChoices: choices } };
        }
        const result = await addPlainProduct(input, { ...workingContext, cartToken: token }, found.product, request.quantity);
        if (result.kind === "composition_needed") return { handled: true, body: `Encontrei ${result.profile.name}. Agora me diga a composição. O total precisa dar ${result.profile.distributionTotal} unidades. Exemplo: 15 coxinhas, 10 bolinhas de queijo e 5 salsichas.`, nextStep: "order_items", context: { ...workingContext, cartToken: token, pendingComposition: result.profile } };
        if (result.kind === "needs_options") return { handled: true, body: result.message, nextStep: "order_items", context: workingContext };
        token = result.token; added.push(...result.added); workingContext = { ...workingContext, cartToken: token };
      }
      if (!token || !added.length) return { handled: true, body: "Não consegui montar o pedido. Tente informar produto e quantidade novamente.", nextStep: "order_items", context };
      return continueAfterAdded(input, workingContext, token, added);
    }

    if (!context.cartToken) return { handled: true, body: "Seu pedido em andamento expirou. Vamos começar de novo. Envie os itens com quantidade.", nextStep: "order_items", context: { channel: "whatsapp_order", version: 1 } };
    if (input.step === "order_name") {
      const customerName = input.text.trim(); if (customerName.length < 2 || customerName.length > 120) return { handled: true, body: "Digite seu nome para eu continuar o pedido.", nextStep: "order_name", context };
      await CheckoutService.saveIdentity(input.storeSlug, context.cartToken, { name: customerName, phone: input.contactPhone, email: null });
      return { handled: true, body: "Como você quer receber?\n1 — Entrega\n2 — Retirada", nextStep: "order_fulfillment", context: { ...context, customerName } };
    }
    if (input.step === "order_fulfillment") {
      const fulfillment = parseFulfillment(input.text); if (!fulfillment) return { handled: true, body: "Escolha uma opção:\n1 — Entrega\n2 — Retirada", nextStep: "order_fulfillment", context };
      try { await CheckoutService.saveFulfillment(input.storeSlug, context.cartToken, fulfillment); } catch (error) { if (error instanceof CheckoutError) return { handled: true, body: `${error.message}. Escolha outra opção ou digite menu.`, nextStep: "order_fulfillment", context }; throw error; }
      if (fulfillment === "delivery") return { handled: true, body: "Envie o endereço neste formato:\nRua, número, bairro, cidade, UF", nextStep: "order_address", context: { ...context, fulfillment } };
      const options = await paymentOptions(input.organizationId, input.storeId); return { handled: true, body: buildWhatsAppPaymentPrompt(options), nextStep: "order_payment", context: { ...context, fulfillment } };
    }
    if (input.step === "order_address") {
      const address = parseAddress(input.text); if (!address) return { handled: true, body: "Não consegui entender o endereço. Envie assim:\nRua, número, bairro, cidade, UF", nextStep: "order_address", context };
      try { const quote = await CheckoutService.saveAddress(input.storeSlug, context.cartToken, address); const options = await paymentOptions(input.organizationId, input.storeId); return { handled: true, body: `Endereço atendido. Taxa de entrega: ${money(quote.feeCents)}.\n\n${buildWhatsAppPaymentPrompt(options)}`, nextStep: "order_payment", context }; } catch (error) { if (error instanceof CheckoutError) return { handled: true, body: `${error.message}. Confira o endereço e envie novamente ou digite 3 para falar com a equipe.`, nextStep: "order_address", context }; throw error; }
    }
    if (input.step === "order_payment") {
      if (context.awaitingPixEmail && context.paymentMethod === "pix") {
        const customerName = (context.customerName ?? input.contactName ?? "").trim();
        try {
          await CheckoutService.saveIdentity(input.storeSlug, context.cartToken, { name: customerName, phone: input.contactPhone, email: input.text.trim() });
          await CheckoutService.savePayment(input.storeSlug, context.cartToken, { method: "pix", customPaymentMethodId: null, cashChangeForCents: null });
          const nextContext: WhatsAppOrderContext = { ...context, paymentMethod: "pix", paymentLabel: paymentMethodLabels.pix, awaitingPixEmail: undefined };
          return { handled: true, body: await reviewSummary(input.storeSlug, context.cartToken, nextContext), nextStep: "order_confirmation", context: nextContext };
        } catch (error) {
          if (error instanceof CheckoutError && error.code === "invalid_identity") {
            return { handled: true, body: "Para usar Pix, envie um e-mail válido, por exemplo nome@exemplo.com.", nextStep: "order_payment", context };
          }
          if (error instanceof CheckoutError && error.code === "payment_unavailable") {
            const options = await paymentOptions(input.organizationId, input.storeId);
            return { handled: true, body: `O Pix deixou de estar disponível. Escolha outra forma de pagamento.\n\n${buildWhatsAppPaymentPrompt(options)}`, nextStep: "order_payment", context: { ...context, paymentMethod: undefined, paymentLabel: undefined, awaitingPixEmail: undefined } };
          }
          throw error;
        }
      }

      const options = await paymentOptions(input.organizationId, input.storeId);
      const selected = resolveWhatsAppPaymentSelection(input.text, options);
      if (!selected) return { handled: true, body: `Escolha a forma de pagamento informada abaixo pelo número ou pelo nome.\n\n${buildWhatsAppPaymentPrompt(options)}`, nextStep: "order_payment", context };
      try {
        await CheckoutService.savePayment(input.storeSlug, context.cartToken, {
          method: selected.method,
          customPaymentMethodId: selected.customPaymentMethodId,
          cashChangeForCents: null,
        });
      } catch (error) {
        if (error instanceof CheckoutError && error.code === "pix_email_required" && selected.method === "pix") {
          return {
            handled: true,
            body: "Para gerar o Pix online com segurança, preciso do seu e-mail. Envie um e-mail válido, por exemplo nome@exemplo.com.",
            nextStep: "order_payment",
            context: { ...context, paymentMethod: "pix", customPaymentMethodId: undefined, paymentLabel: selected.label, awaitingPixEmail: true },
          };
        }
        if (error instanceof CheckoutError && error.code === "payment_unavailable") {
          const currentOptions = await paymentOptions(input.organizationId, input.storeId);
          return { handled: true, body: `Essa forma de pagamento deixou de estar disponível. Escolha outra opção.\n\n${buildWhatsAppPaymentPrompt(currentOptions)}`, nextStep: "order_payment", context };
        }
        throw error;
      }
      const nextContext: WhatsAppOrderContext = {
        ...context,
        paymentMethod: selected.method,
        customPaymentMethodId: selected.customPaymentMethodId ?? undefined,
        paymentLabel: selected.label,
        awaitingPixEmail: undefined,
      };
      return { handled: true, body: await reviewSummary(input.storeSlug, context.cartToken, nextContext), nextStep: "order_confirmation", context: nextContext };
    }
    if (input.step === "order_confirmation") {
      if (isNo(input.text)) return { handled: true, body: "Pedido cancelado. Nada foi enviado para a loja. Para começar outro pedido, digite 7.", nextStep: "menu", context: null };
      if (!isYes(input.text)) return { handled: true, body: "Responda SIM para confirmar o pedido ou NÃO para cancelar.", nextStep: "order_confirmation", context };
      const result = await OrderService.createFromCheckout(input.storeSlug, context.cartToken); const admin = createAdminClient(); const { error } = await admin.from("orders").update({ channel: "whatsapp", updated_at: new Date().toISOString() }).eq("id", result.order_id).eq("organization_id", input.organizationId).eq("store_id", input.storeId); if (error) throw error;
      await OrderNotificationContextService.capture(result.order_id, result.accessToken); scheduleOrderWhatsAppNotifications("checkout.order_created");
      return { handled: true, body: `Pedido #${result.display_number} criado com sucesso pelo WhatsApp ✅\nA loja recebeu o pedido. Para acompanhar, digite 2.`, nextStep: "menu", context: null };
    }
    return { handled: true, body: "Vamos começar novamente. Envie os itens com quantidade.", nextStep: "order_items", context: { channel: "whatsapp_order", version: 1 } };
  }
}