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

export function normalizeComparablePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

export function resolveOrderRecipientPolicy(input: {
  customerPhoneNormalized: string | null | undefined;
  customerPhoneSnapshot: string | null | undefined;
}): OrderRecipientResolution {
  const canonical = normalizeComparablePhone(input.customerPhoneNormalized);
  const snapshot = normalizeComparablePhone(input.customerPhoneSnapshot);

  if (canonical && snapshot && canonical !== snapshot) {
    return { ok: false, reason: "customer_phone_conflict" };
  }
  if (canonical) return { ok: true, phoneNormalized: canonical, source: "customer" };
  if (snapshot) return { ok: true, phoneNormalized: snapshot, source: "order_snapshot" };

  return { ok: false, reason: "customer_phone_missing" };
}
