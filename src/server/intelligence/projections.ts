import { allowedDisclosure, type DisclosureAuthorization } from "@/server/intelligence/disclosure-policy";
import type { IntelligenceContext } from "@/server/intelligence/context";

export type CustomerIdentityRecord = {
  customerId: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  addresses: readonly unknown[];
  orderHistory: readonly unknown[];
};

export function projectIdentityForAudience(
  context: IntelligenceContext,
  record: CustomerIdentityRecord,
  authorization: DisclosureAuthorization = {},
) {
  if (!context.identity.customerId || context.identity.customerId !== record.customerId) return null;
  return {
    displayName: allowedDisclosure(context, "display_name", authorization) ? record.displayName : null,
    phone: allowedDisclosure(context, "contact", authorization) ? record.phone : null,
    email: allowedDisclosure(context, "contact", authorization) ? record.email : null,
    addresses: allowedDisclosure(context, "address", authorization) ? [...record.addresses] : [],
    orderHistory: allowedDisclosure(context, "order_history", authorization) ? [...record.orderHistory] : [],
    customerId: allowedDisclosure(context, "internal_identifiers", authorization) ? record.customerId : null,
  };
}

