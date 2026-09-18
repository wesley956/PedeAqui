import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type OrderRecipientResolution =
  | {
      ok: true;
      phoneNormalized: string;
      source: "customer" | "order_snapshot";
    }
  | {
      ok: false;
      reason: "customer_phone_conflict" | "customer_phone_missing";
    };

function normalizeComparablePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

export async function resolveOrderRecipient(input: {
  organizationId: string;
  customerId: string | null | undefined;
  customerPhoneSnapshot: string | null | undefined;
}): Promise<OrderRecipientResolution> {
  const admin = createAdminClient();
  const snapshot = normalizeComparablePhone(input.customerPhoneSnapshot);

  const customerResult = input.customerId
    ? await admin.from("customers")
        .select("phone_normalized")
        .eq("organization_id", input.organizationId)
        .eq("id", input.customerId)
        .maybeSingle()
    : { data: null, error: null };

  if (customerResult.error) throw customerResult.error;

  const canonical = normalizeComparablePhone(customerResult.data?.phone_normalized);

  if (canonical && snapshot && canonical !== snapshot) {
    return { ok: false, reason: "customer_phone_conflict" };
  }
  if (canonical) return { ok: true, phoneNormalized: canonical, source: "customer" };
  if (snapshot) return { ok: true, phoneNormalized: snapshot, source: "order_snapshot" };

  return { ok: false, reason: "customer_phone_missing" };
}
