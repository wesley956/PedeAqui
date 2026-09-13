import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { phonesBelongToSameCustomer } from "@/server/conversations/bot-menu";
import {
  asksAboutSavedAddress,
  asksForTrackingNumberHelp,
  formatSavedAddress,
  quantityOnlyRequest,
  type WhatsAppSavedAddress,
} from "@/server/conversations/whatsapp-customer-context-core";

export {
  asksAboutSavedAddress,
  asksForTrackingNumberHelp,
  formatSavedAddress,
  quantityOnlyRequest,
  type WhatsAppSavedAddress,
};

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

export async function loadWhatsAppSavedAddresses(input: {
  organizationId: string;
  storeId: string;
  contactPhone: string;
  customerId?: string | null;
}): Promise<WhatsAppSavedAddress[]> {
  const admin = createAdminClient();
  let customerId = input.customerId ?? null;

  if (!customerId) {
    const variants = phoneVariants(input.contactPhone);
    if (!variants.length) return [];
    const { data: contacts, error: contactError } = await admin.from("contacts")
      .select("customer_id")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("channel", "whatsapp")
      .in("phone_normalized", variants)
      .limit(3);
    if (contactError) throw contactError;
    const ids = [...new Set((contacts ?? []).map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
    if (ids.length === 1) customerId = ids[0]!;
    if (ids.length > 1) return [];
  }

  if (!customerId) return [];
  const { data, error } = await admin.from("customer_addresses")
    .select("id, customer_id, label, street, number, complement, district, city, state, is_default")
    .eq("organization_id", input.organizationId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []).filter((row) => row.street && row.number && row.district && row.city && row.state) as WhatsAppSavedAddress[];
}

export async function loadRecentOwnedOrderNumbers(input: {
  organizationId: string;
  storeId: string;
  contactPhone: string;
  limit?: number;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("orders")
    .select("display_number, customer_phone_snapshot, created_at")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  const limit = Math.max(1, Math.min(input.limit ?? 3, 5));
  return (data ?? [])
    .filter((order) => phonesBelongToSameCustomer(input.contactPhone, order.customer_phone_snapshot))
    .slice(0, limit)
    .map((order) => Number(order.display_number))
    .filter((number) => Number.isFinite(number));
}
