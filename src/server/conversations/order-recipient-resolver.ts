import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOrderRecipientPolicy,
  type OrderRecipientResolution,
} from "@/server/conversations/order-recipient-policy";

export async function resolveOrderRecipient(input: {
  organizationId: string;
  customerId: string | null | undefined;
  customerPhoneSnapshot: string | null | undefined;
}): Promise<OrderRecipientResolution> {
  const admin = createAdminClient();

  const customerResult = input.customerId
    ? await admin.from("customers")
        .select("phone_normalized")
        .eq("organization_id", input.organizationId)
        .eq("id", input.customerId)
        .maybeSingle()
    : { data: null, error: null };

  if (customerResult.error) throw customerResult.error;

  return resolveOrderRecipientPolicy({
    customerPhoneNormalized: customerResult.data?.phone_normalized,
    customerPhoneSnapshot: input.customerPhoneSnapshot,
  });
}
