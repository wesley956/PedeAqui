import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isWhatsAppOrderStep,
  looksLikeWhatsAppOrderItems,
  WhatsAppOrderService as BaseWhatsAppOrderService,
  whatsappOrderStartMessage,
  type WhatsAppOrderContext,
  type WhatsAppOrderHandleResult,
  type WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-order-service";
import {
  assortedRequestedFlavorCount,
  buildEqualSplitCompositionText,
  isAssortedCompositionRequest,
} from "@/server/conversations/whatsapp-assorted-composition";
import {
  classifyOrderLearningOutcome,
  sanitizeLearningPhrase,
  WhatsAppLanguageLearningService,
} from "@/server/conversations/whatsapp-language-learning";

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof BaseWhatsAppOrderService.handle>[0];

type SavedAddress = {
  id: string;
  customer_id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  is_default: boolean;
};

type ContextWithEnhancements = WhatsAppOrderContext & {
  learningPendingPhrase?: string;
  savedAddressChoices?: SavedAddress[];
};

type AssortedRewrite = {
  text: string;
  total: number;
  flavorCount: number;
};

function pendingLearningPhrase(context: unknown) {
  if (!context || typeof context !== "object") return null;
  const value = (context as Record<string, unknown>).learningPendingPhrase;
  return typeof value === "string" ? value : null;
}

function hasPendingOrderDecision(context: unknown) {
  if (!context || typeof context !== "object") return false;
  const raw = context as Record<string, unknown>;
  return Boolean(raw.pendingChoices || raw.pendingComposition);
}

function withPendingLearning(result: WhatsAppOrderHandleResult, phrase: string | null): WhatsAppOrderHandleResult {
  if (!phrase || !result.context) return result;
  return {
    ...result,
    context: { ...result.context, learningPendingPhrase: phrase } as ContextWithEnhancements,
  };
}

function fallbackQuantity(text: string) {
  const match = text.trim().match(/^(\d{1,2})\b/);
  const quantity = match ? Number(match[1]) : 1;
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : 1;
}

function addressContext(value: unknown): ContextWithEnhancements {
  if (!value || typeof value !== "object") return { channel: "whatsapp_order", version: 1 };
  return value as ContextWithEnhancements;
}

function clearSavedAddresses(context: ContextWithEnhancements): WhatsAppOrderContext {
  const { savedAddressChoices: _savedAddressChoices, ...rest } = context;
  return rest;
}

async function rewriteAssortedComposition(input: OrderInput): Promise<AssortedRewrite | WhatsAppOrderHandleResult | null> {
  if (input.step !== "order_items" || !isAssortedCompositionRequest(input.text) || !input.context || typeof input.context !== "object") return null;
  const pending = (input.context as Record<string, unknown>).pendingComposition;
  if (!pending || typeof pending !== "object") return null;
  const raw = pending as Record<string, unknown>;
  const groupId = typeof raw.groupId === "string" ? raw.groupId : null;
  const total = typeof raw.distributionTotal === "number" ? raw.distributionTotal : null;
  if (!groupId || !Number.isInteger(total) || !total || total < 1) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("modifiers")
    .select("id, name")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("modifier_group_id", groupId)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  const modifiers = (data ?? []).filter((item) => typeof item.name === "string" && item.name.trim());
  if (modifiers.length < 2) return null;

  const requestedCount = assortedRequestedFlavorCount(input.text);
  if (requestedCount !== null && requestedCount !== modifiers.length) {
    return {
      handled: true,
      body: `Encontrei ${modifiers.length} sabores disponíveis para essa caixa. Para fazer sortido automaticamente, posso distribuir entre todos os ${modifiers.length}. Se quiser apenas ${requestedCount}, me diga quais sabores deseja.`,
      nextStep: "order_items",
      context: input.context as WhatsAppOrderContext,
    };
  }

  const text = buildEqualSplitCompositionText(total, modifiers.map((item) => item.name));
  return text ? { text, total, flavorCount: modifiers.length } : null;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function phoneVariants(value: string) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  const local = normalized.startsWith("55") && normalized.length >= 12 ? normalized.slice(2) : normalized;
  return [...new Set([normalized, `+${normalized}`, local, `+55${local}`])];
}

function addressLine(address: SavedAddress) {
  const complement = address.complement?.trim() ? `, ${address.complement.trim()}` : "";
  return `${address.street}, ${address.number}${complement} — ${address.district}, ${address.city}/${address.state}`;
}

function addressAsManualInput(address: SavedAddress) {
  return [address.street, address.number, address.district, address.city, address.state, address.complement]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
}

function manualAddressPrompt() {
  return "Envie o endereço neste formato:\nRua, número, bairro, cidade, UF";
}

function savedAddressPrompt(addresses: SavedAddress[]) {
  if (addresses.length === 1) {
    return `Encontrei seu endereço cadastrado:\n${addressLine(addresses[0]!)}\n\nDeseja entregar neste endereço?\n1 — Sim\n2 — Usar outro endereço`;
  }

  const lines = addresses.map((address, index) => {
    const label = address.label?.trim() ? `${address.label.trim()}: ` : "";
    const preferred = address.is_default ? " ⭐" : "";
    return `${index + 1} — ${label}${addressLine(address)}${preferred}`;
  });
  return `Encontrei seus endereços cadastrados:\n${lines.join("\n")}\n${addresses.length + 1} — Usar outro endereço\n\nResponda com o número do endereço.`;
}

function wantsAnotherAddress(text: string, addresses: SavedAddress[]) {
  const normalized = text.trim().toLowerCase();
  if (["outro", "outro endereco", "outro endereço", "novo", "novo endereco", "novo endereço", "usar outro", "trocar endereco", "trocar endereço"].includes(normalized)) return true;
  if (addresses.length === 1 && normalized === "2") return true;
  if (addresses.length > 1 && normalized === String(addresses.length + 1)) return true;
  return false;
}

function pickSavedAddress(text: string, addresses: SavedAddress[]) {
  const normalized = text.trim().toLowerCase();
  if (addresses.length === 1 && ["1", "sim", "s", "usar", "pode ser", "esse", "este", "confirmar", "confirmo"].includes(normalized)) return addresses[0]!;
  if (/^\d+$/.test(normalized)) {
    const index = Number(normalized) - 1;
    if (index >= 0 && index < addresses.length) return addresses[index]!;
  }
  const byLabel = addresses.filter((address) => address.label && address.label.trim().toLowerCase() === normalized);
  return byLabel.length === 1 ? byLabel[0]! : null;
}

async function loadSavedAddresses(input: OrderInput): Promise<SavedAddress[]> {
  const admin = createAdminClient();
  const variants = phoneVariants(input.contactPhone);
  if (!variants.length) return [];

  let customerId: string | null = null;
  const { data: contacts, error: contactError } = await admin
    .from("contacts")
    .select("id, customer_id")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("channel", "whatsapp")
    .in("phone_normalized", variants)
    .limit(2);
  if (contactError) throw contactError;

  const linkedCustomerIds = [...new Set((contacts ?? []).map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  if (linkedCustomerIds.length === 1) customerId = linkedCustomerIds[0]!;
  if (linkedCustomerIds.length > 1) return [];

  if (!customerId) {
    const { data: customers, error: customerError } = await admin
      .from("customers")
      .select("id")
      .eq("organization_id", input.organizationId)
      .is("deleted_at", null)
      .in("phone_normalized", variants)
      .limit(2);
    if (customerError) throw customerError;
    if ((customers ?? []).length !== 1) return [];
    customerId = customers![0]!.id;

    const contactIds = (contacts ?? []).map((row) => row.id).filter(Boolean);
    if (contactIds.length) {
      await admin
        .from("contacts")
        .update({ customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .in("id", contactIds)
        .is("customer_id", null);
    }
  }

  const { data, error } = await admin
    .from("customer_addresses")
    .select("id, customer_id, label, street, number, complement, district, city, state, is_default")
    .eq("organization_id", input.organizationId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  return (data ?? []).filter((address) => address.street && address.number && address.district && address.city && address.state) as SavedAddress[];
}

async function handleSavedAddressStep(input: OrderInput, context: ContextWithEnhancements): Promise<WhatsAppOrderHandleResult | null> {
  const addresses = context.savedAddressChoices;
  if (input.step !== "order_address" || !addresses?.length) return null;

  if (input.text.split(",").map((part) => part.trim()).filter(Boolean).length >= 5) {
    return BaseWhatsAppOrderService.handle({ ...input, context: clearSavedAddresses(context) });
  }

  if (wantsAnotherAddress(input.text, addresses)) {
    return {
      handled: true,
      body: manualAddressPrompt(),
      nextStep: "order_address",
      context: clearSavedAddresses(context),
    };
  }

  const selected = pickSavedAddress(input.text, addresses);
  if (!selected) {
    return {
      handled: true,
      body: savedAddressPrompt(addresses),
      nextStep: "order_address",
      context,
    };
  }

  const admin = createAdminClient();
  const { data: current, error } = await admin
    .from("customer_addresses")
    .select("id, customer_id, label, street, number, complement, district, city, state, is_default")
    .eq("organization_id", input.organizationId)
    .eq("customer_id", selected.customer_id)
    .eq("id", selected.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;

  if (!current) {
    return {
      handled: true,
      body: `Esse endereço não está mais disponível.\n\n${manualAddressPrompt()}`,
      nextStep: "order_address",
      context: clearSavedAddresses(context),
    };
  }

  return BaseWhatsAppOrderService.handle({
    ...input,
    text: addressAsManualInput(current as SavedAddress),
    context: clearSavedAddresses(context),
  });
}

export class WhatsAppOrderService {
  static async handle(input: OrderInput): Promise<WhatsAppOrderHandleResult> {
    const context = addressContext(input.context);
    const savedAddressResult = await handleSavedAddressStep(input, context);
    if (savedAddressResult) return savedAddressResult;

    const assorted = await rewriteAssortedComposition(input);
    if (assorted && "handled" in assorted) return assorted;
    const effectiveInput = assorted ? { ...input, text: assorted.text } : input;

    const previousPending = pendingLearningPhrase(input.context);
    let result = await BaseWhatsAppOrderService.handle(effectiveInput);
    let outcome = classifyOrderLearningOutcome(result.body);

    if (
      input.step === "order_items" &&
      outcome === "unresolved" &&
      !hasPendingOrderDecision(input.context)
    ) {
      const alias = await WhatsAppLanguageLearningService.findLearnedProductAlias({
        organizationId: input.organizationId,
        storeId: input.storeId,
        phrase: input.text,
      });
      if (alias) {
        const retry = await BaseWhatsAppOrderService.handle({
          ...input,
          text: `${fallbackQuantity(input.text)} ${alias}`,
        });
        if (classifyOrderLearningOutcome(retry.body) === "resolved") {
          result = retry;
          outcome = "resolved";
        }
      }
    }

    if (input.step === "order_items") {
      await WhatsAppLanguageLearningService.recordOutcome({
        organizationId: input.organizationId,
        storeId: input.storeId,
        phrase: input.text,
        body: result.body,
      });

      if (previousPending && outcome === "resolved") {
        await WhatsAppLanguageLearningService.recordCorrection({
          organizationId: input.organizationId,
          storeId: input.storeId,
          originalPhrase: previousPending,
          resolvedBody: result.body,
        });
      }

      if (outcome === "unresolved") {
        return withPendingLearning(result, sanitizeLearningPhrase(input.text));
      }
    }

    if (input.step === "order_fulfillment" && result.nextStep === "order_address" && result.context?.fulfillment === "delivery") {
      try {
        const addresses = await loadSavedAddresses(input);
        if (addresses.length) {
          return {
            ...result,
            body: savedAddressPrompt(addresses),
            context: { ...result.context, savedAddressChoices: addresses } as ContextWithEnhancements,
          };
        }
      } catch (error) {
        console.warn("whatsapp saved address lookup skipped", error instanceof Error ? error.message : "unknown error");
      }
    }

    if (assorted && outcome === "resolved") {
      return {
        ...result,
        body: `Perfeito 😊 Distribuí as ${assorted.total} unidades o mais igualmente possível entre os ${assorted.flavorCount} sabores disponíveis.\n\n${result.body}`,
      };
    }

    return result;
  }
}
