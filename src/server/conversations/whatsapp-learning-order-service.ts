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

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof BaseWhatsAppOrderService.handle>[0];

type SavedAddress = {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  is_default: boolean;
};

type AddressAwareContext = WhatsAppOrderContext & {
  savedAddressChoices?: SavedAddress[];
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function asAddressContext(value: unknown): AddressAwareContext {
  if (!value || typeof value !== "object") return { channel: "whatsapp_order", version: 1 };
  return value as AddressAwareContext;
}

function withoutSavedAddresses(context: AddressAwareContext): WhatsAppOrderContext {
  const { savedAddressChoices: _ignored, ...rest } = context;
  return rest;
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
  if (["outro", "outro endereco", "outro endereço", "novo", "novo endereco", "novo endereço"].includes(normalized)) return true;
  if (addresses.length === 1 && normalized === "2") return true;
  if (addresses.length > 1 && normalized === String(addresses.length + 1)) return true;
  return false;
}

function pickSavedAddress(text: string, addresses: SavedAddress[]) {
  const normalized = text.trim().toLowerCase();
  if (addresses.length === 1 && ["1", "sim", "s", "usar", "pode ser", "esse", "este"].includes(normalized)) return addresses[0]!;
  const numeric = normalized.match(/^\d+$/);
  if (numeric) {
    const index = Number(numeric[0]) - 1;
    if (index >= 0 && index < addresses.length) return addresses[index]!;
  }
  const byLabel = addresses.filter((address) => address.label && address.label.trim().toLowerCase() === normalized);
  return byLabel.length === 1 ? byLabel[0]! : null;
}

async function loadSavedAddresses(input: OrderInput): Promise<SavedAddress[]> {
  const admin = createAdminClient();
  const phone = normalizePhone(input.contactPhone);
  if (!phone) return [];

  let customerId: string | null = null;
  const { data: contact } = await admin
    .from("contacts")
    .select("customer_id")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("channel", "whatsapp")
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (contact?.customer_id) customerId = contact.customer_id;

  if (!customerId) {
    const variants = [...new Set([phone, phone.startsWith("55") ? phone.slice(2) : `55${phone}`])];
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

    await admin
      .from("contacts")
      .update({ customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("channel", "whatsapp")
      .eq("phone_normalized", phone)
      .is("customer_id", null);
  }

  const { data, error } = await admin
    .from("customer_addresses")
    .select("id, label, street, number, complement, district, city, state, is_default")
    .eq("organization_id", input.organizationId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  return (data ?? []).filter((address) => address.street && address.number && address.district && address.city && address.state) as SavedAddress[];
}

export class WhatsAppOrderService {
  static async handle(input: OrderInput): Promise<WhatsAppOrderHandleResult> {
    const context = asAddressContext(input.context);

    if (input.step === "order_address" && context.savedAddressChoices?.length) {
      const addresses = context.savedAddressChoices;
      if (input.text.split(",").map((part) => part.trim()).filter(Boolean).length >= 5) {
        return BaseWhatsAppOrderService.handle({ ...input, context: withoutSavedAddresses(context) });
      }
      if (wantsAnotherAddress(input.text, addresses)) {
        return {
          handled: true,
          body: manualAddressPrompt(),
          nextStep: "order_address",
          context: withoutSavedAddresses(context),
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

      // Revalidate the address immediately before use so a stale or foreign id can never be trusted from session context.
      const admin = createAdminClient();
      const { data: current, error } = await admin
        .from("customer_addresses")
        .select("id, street, number, complement, district, city, state")
        .eq("organization_id", input.organizationId)
        .eq("id", selected.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!current) {
        return {
          handled: true,
          body: `Esse endereço não está mais disponível.\n\n${manualAddressPrompt()}`,
          nextStep: "order_address",
          context: withoutSavedAddresses(context),
        };
      }

      return BaseWhatsAppOrderService.handle({
        ...input,
        text: addressAsManualInput({ ...selected, ...current }),
        context: withoutSavedAddresses(context),
      });
    }

    const result = await BaseWhatsAppOrderService.handle(input);
    if (input.step !== "order_fulfillment" || result.nextStep !== "order_address" || result.context?.fulfillment !== "delivery") return result;

    try {
      const addresses = await loadSavedAddresses(input);
      if (!addresses.length) return result;
      const nextContext: AddressAwareContext = { ...result.context, savedAddressChoices: addresses };
      return {
        ...result,
        body: savedAddressPrompt(addresses),
        context: nextContext,
      };
    } catch (error) {
      console.warn("whatsapp saved address lookup skipped", error instanceof Error ? error.message : "unknown error");
      return result;
    }
  }
}
