import type { AuthorityOperation, AuthoritySnapshot } from "@/server/intelligence/authority";
import type { CapabilitySnapshot, IntelligenceCapabilityKey } from "@/server/intelligence/capability";
import type { IntelligenceAudience, IntelligenceContext, IdentityTrustLevel } from "@/server/intelligence/context";

export const transactionToolNames = [
  "cart.addItem",
  "cart.updateItem",
  "cart.removeItem",
  "checkout.setIdentity",
  "checkout.setFulfillment",
  "checkout.setAddress",
  "checkout.setPayment",
  "order.create",
  "order.requestChange",
  "order.requestCancellation",
  "handoff.request",
  "payment.offerPix",
] as const;

export type TransactionToolName = (typeof transactionToolNames)[number];
export type MutationLevel = "N1" | "N2";
export type SideEffectClass = "cart" | "checkout" | "order" | "conversation" | "payment";
export type ConfirmationRequirement = "none" | "explicit";
export type TransactionConfirmation = "confirmed" | "rejected" | "ambiguous" | "missing";
export type IdempotencyPolicy = "required" | "canonical_source_cart" | "canonical_transition";
export type AuthorityPolicy = "none" | "create_internal_order" | AuthorityOperation;

export type TransactionToolContract = {
  name: TransactionToolName;
  audience: readonly IntelligenceAudience[];
  requiredCapabilities: readonly IntelligenceCapabilityKey[];
  minimumTrust: IdentityTrustLevel;
  canonicalService: string;
  authorityPolicy: AuthorityPolicy;
  sideEffectClass: SideEffectClass;
  mutationLevel: MutationLevel;
  confirmation: ConfirmationRequirement;
  idempotency: IdempotencyPolicy;
  auditEvent: string;
  compensation: "none" | "canonical_service_only";
};

const customerAudience = ["customer", "agent"] as const satisfies readonly IntelligenceAudience[];

export const transactionToolRegistry: Record<TransactionToolName, TransactionToolContract> = {
  "cart.addItem": {
    name: "cart.addItem", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CartService.addItem", authorityPolicy: "none", sideEffectClass: "cart", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.cart.add_item", compensation: "canonical_service_only",
  },
  "cart.updateItem": {
    name: "cart.updateItem", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CartService.updateQuantity", authorityPolicy: "none", sideEffectClass: "cart", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.cart.update_item", compensation: "canonical_service_only",
  },
  "cart.removeItem": {
    name: "cart.removeItem", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CartService.removeItem", authorityPolicy: "none", sideEffectClass: "cart", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.cart.remove_item", compensation: "canonical_service_only",
  },
  "checkout.setIdentity": {
    name: "checkout.setIdentity", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CheckoutService.saveIdentity", authorityPolicy: "none", sideEffectClass: "checkout", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.checkout.set_identity", compensation: "canonical_service_only",
  },
  "checkout.setFulfillment": {
    name: "checkout.setFulfillment", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CheckoutService.saveFulfillment", authorityPolicy: "none", sideEffectClass: "checkout", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.checkout.set_fulfillment", compensation: "canonical_service_only",
  },
  "checkout.setAddress": {
    name: "checkout.setAddress", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CheckoutService.saveAddress", authorityPolicy: "none", sideEffectClass: "checkout", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.checkout.set_address", compensation: "canonical_service_only",
  },
  "checkout.setPayment": {
    name: "checkout.setPayment", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "CheckoutService.savePayment", authorityPolicy: "none", sideEffectClass: "checkout", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.checkout.set_payment", compensation: "canonical_service_only",
  },
  "order.create": {
    name: "order.create", audience: customerAudience, requiredCapabilities: ["canCreateOrder"], minimumTrust: "weak",
    canonicalService: "OrderService.createFromCheckout", authorityPolicy: "create_internal_order", sideEffectClass: "order", mutationLevel: "N2",
    confirmation: "explicit", idempotency: "canonical_source_cart", auditEvent: "intelligence.transaction.order.create", compensation: "none",
  },
  "order.requestChange": {
    name: "order.requestChange", audience: customerAudience, requiredCapabilities: ["canMutateOrder"], minimumTrust: "verified",
    canonicalService: "OrderService.transition", authorityPolicy: "confirm_order", sideEffectClass: "order", mutationLevel: "N2",
    confirmation: "explicit", idempotency: "canonical_transition", auditEvent: "intelligence.transaction.order.request_change", compensation: "canonical_service_only",
  },
  "order.requestCancellation": {
    name: "order.requestCancellation", audience: customerAudience, requiredCapabilities: ["canMutateOrder"], minimumTrust: "verified",
    canonicalService: "OrderService.transition", authorityPolicy: "cancel_order", sideEffectClass: "order", mutationLevel: "N2",
    confirmation: "explicit", idempotency: "canonical_transition", auditEvent: "intelligence.transaction.order.request_cancellation", compensation: "canonical_service_only",
  },
  "handoff.request": {
    name: "handoff.request", audience: customerAudience, requiredCapabilities: [], minimumTrust: "weak",
    canonicalService: "conversation_transition_internal", authorityPolicy: "none", sideEffectClass: "conversation", mutationLevel: "N1",
    confirmation: "none", idempotency: "canonical_transition", auditEvent: "intelligence.transaction.handoff.request", compensation: "none",
  },
  "payment.offerPix": {
    name: "payment.offerPix", audience: customerAudience, requiredCapabilities: ["canOfferPix"], minimumTrust: "verified",
    canonicalService: "PaymentIntelligenceAdapter / official Pix service", authorityPolicy: "offer_pedeaqui_pix", sideEffectClass: "payment", mutationLevel: "N1",
    confirmation: "none", idempotency: "required", auditEvent: "intelligence.transaction.payment.offer_pix", compensation: "canonical_service_only",
  },
};

const trustRank: Record<IdentityTrustLevel, number> = { none: 0, weak: 1, verified: 2, privileged: 3 };

export type TransactionGuardInput = {
  context: IntelligenceContext;
  tool: TransactionToolName;
  capabilitySnapshot?: CapabilitySnapshot | null;
  authoritySnapshot?: AuthoritySnapshot | null;
  confirmation?: TransactionConfirmation;
  idempotencyKey?: string | null;
};

export type TransactionGuardReason =
  | "allowed"
  | "audience_not_allowed"
  | "human_lock"
  | "identity_trust_insufficient"
  | "scope_mismatch"
  | "capability_unresolved"
  | "capability_denied"
  | "authority_unresolved"
  | "authority_denied"
  | "confirmation_required"
  | "confirmation_rejected"
  | "idempotency_key_required";

export type TransactionGuardDecision = {
  allowed: boolean;
  tool: TransactionToolName;
  contract: TransactionToolContract;
  reasons: TransactionGuardReason[];
};

export function classifyExplicitConfirmation(value: string | null | undefined): TransactionConfirmation {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "missing";
  if (["sim", "s", "confirmar", "confirmo", "pode confirmar", "fechar pedido", "finalizar"].includes(normalized)) return "confirmed";
  if (["nao", "n", "cancelar", "cancela", "desistir"].includes(normalized)) return "rejected";
  return "ambiguous";
}

export function guardTransactionTool(input: TransactionGuardInput): TransactionGuardDecision {
  const contract = transactionToolRegistry[input.tool];
  const reasons: TransactionGuardReason[] = [];
  const capabilityScoped = !input.capabilitySnapshot
    || (input.capabilitySnapshot.organizationId === input.context.organizationId && input.capabilitySnapshot.storeId === input.context.storeId);
  const authorityScoped = !input.authoritySnapshot
    || (input.authoritySnapshot.organizationId === input.context.organizationId
      && input.authoritySnapshot.storeId === input.context.storeId
      && (!input.context.activeReferences.orderId || input.authoritySnapshot.orderId === input.context.activeReferences.orderId));

  if (!contract.audience.includes(input.context.audience)) reasons.push("audience_not_allowed");
  if (input.context.conversation.mode === "human" || input.context.conversation.mode === "waiting_agent") reasons.push("human_lock");
  if (trustRank[input.context.identity.trust] < trustRank[contract.minimumTrust]) reasons.push("identity_trust_insufficient");
  if (!capabilityScoped || !authorityScoped) reasons.push("scope_mismatch");

  for (const capability of contract.requiredCapabilities) {
    const decision = capabilityScoped ? input.capabilitySnapshot?.decisions[capability] : undefined;
    if (!decision) reasons.push("capability_unresolved");
    else if (!decision.allowed) reasons.push("capability_denied");
  }

  if (contract.authorityPolicy !== "none" && contract.authorityPolicy !== "create_internal_order") {
    const authorityDecision = authorityScoped ? input.authoritySnapshot?.decisions[contract.authorityPolicy] : undefined;
    if (!authorityDecision) reasons.push("authority_unresolved");
    else if (!authorityDecision.allowed) reasons.push("authority_denied");
  }

  if (contract.confirmation === "explicit") {
    if (input.confirmation === "rejected") reasons.push("confirmation_rejected");
    else if (input.confirmation !== "confirmed") reasons.push("confirmation_required");
  }

  if (contract.idempotency === "required" && !input.idempotencyKey?.trim()) reasons.push("idempotency_key_required");

  return { allowed: reasons.length === 0, tool: input.tool, contract, reasons: reasons.length ? [...new Set(reasons)] : ["allowed"] };
}
