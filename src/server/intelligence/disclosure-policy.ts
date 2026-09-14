import type { IntelligenceAudience, IntelligenceContext } from "@/server/intelligence/context";

export const disclosureFields = ["display_name", "contact", "address", "order_history", "internal_identifiers"] as const;
export type DisclosureField = (typeof disclosureFields)[number];

export type DisclosureAuthorization = {
  permissions?: ReadonlySet<string>;
  requestedAudience?: IntelligenceAudience;
};

export function allowedDisclosure(
  context: IntelligenceContext,
  field: DisclosureField,
  authorization: DisclosureAuthorization = {},
): boolean {
  const audience = authorization.requestedAudience ?? context.audience;
  if (audience !== context.audience) return false;

  if (audience === "customer") {
    if (field === "display_name") return context.identity.trust !== "none";
    return context.identity.trust === "verified" && Boolean(context.identity.customerId) && field !== "internal_identifiers";
  }

  if (audience === "agent" || audience === "merchant") {
    if (context.actor.type !== "merchant_user" || context.identity.trust !== "privileged") return false;
    const permissions = authorization.permissions ?? new Set<string>();
    if (field === "address" || field === "contact") return permissions.has("customers.view_pii");
    if (field === "order_history") return permissions.has("orders.view");
    if (field === "internal_identifiers") return permissions.has("intelligence.debug");
    return permissions.has("customers.view");
  }

  return audience === "system" && context.actor.type === "system" && context.identity.trust === "privileged";
}

