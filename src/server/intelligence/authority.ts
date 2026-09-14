import type { ExternalSyncState, LogisticsOwner, PaymentOwner } from "@/server/integrations/core/canonical-order";
import type { IntelligenceContext } from "@/server/intelligence/context";

export const authorityOperations = [
  "view_order", "confirm_order", "start_production", "mark_ready", "cancel_order",
  "mark_paid", "offer_pedeaqui_pix", "assign_delivery", "advance_delivery",
] as const;
export type AuthorityOperation = (typeof authorityOperations)[number];
export type AuthorityRoute = "local" | "provider_command" | "provider_event" | "deny";
export type ProviderCommand = "confirm" | "start_preparation" | "mark_ready" | "request_cancellation";
export type AuthorityReason =
  | "allowed_local"
  | "provider_command_required"
  | "provider_event_required"
  | "scope_mismatch"
  | "account_not_operational"
  | "sync_not_confirmed"
  | "payment_owned_by_provider"
  | "pedeaqui_pix_forbidden_for_marketplace"
  | "logistics_owned_externally"
  | "operation_not_supported";

export type IntegrationAccountAuthorityFacts = {
  id: string;
  organizationId: string;
  storeId: string;
  status: "connected" | "attention" | "disconnected" | "action_required";
  connectionState: "connected" | "disconnected" | "action_required";
};

export type AuthorityFacts =
  | {
      kind: "internal";
      organizationId: string;
      storeId: string;
      orderId: string;
    }
  | {
      kind: "external";
      organizationId: string;
      storeId: string;
      orderId: string;
      provider: "ifood" | "99food";
      integrationAccountId: string;
      account: IntegrationAccountAuthorityFacts;
      paymentOwner: PaymentOwner;
      logisticsOwner: LogisticsOwner;
      syncStatus: ExternalSyncState;
    };

export type AuthorityOperationDecision = {
  operation: AuthorityOperation;
  allowed: boolean;
  route: AuthorityRoute;
  reason: AuthorityReason;
  requiredProviderCommand: ProviderCommand | null;
  confirmed: boolean;
};

export type AuthoritySnapshot = {
  key: string;
  organizationId: string;
  storeId: string;
  orderId: string;
  orderAuthority: "pedeaqui" | "provider";
  paymentAuthority: PaymentOwner;
  logisticsAuthority: LogisticsOwner;
  provider: "ifood" | "99food" | null;
  integrationAccountId: string | null;
  syncStatus: ExternalSyncState | null;
  confirmationState: "confirmed" | "pending" | "attention";
  allowedLocalOperations: AuthorityOperation[];
  decisions: Record<AuthorityOperation, AuthorityOperationDecision>;
};

const lifecycleCommands: Partial<Record<AuthorityOperation, ProviderCommand>> = {
  confirm_order: "confirm",
  start_production: "start_preparation",
  mark_ready: "mark_ready",
  cancel_order: "request_cancellation",
};

const externalLogisticsOwners = new Set<LogisticsOwner>(["ifood", "99food", "99entrega"]);

function decision(
  operation: AuthorityOperation,
  route: AuthorityRoute,
  reason: AuthorityReason,
  command: ProviderCommand | null = null,
  confirmed = route === "local",
): AuthorityOperationDecision {
  return { operation, allowed: route !== "deny", route, reason, requiredProviderCommand: command, confirmed };
}

function deniedScope(operation: AuthorityOperation) {
  return decision(operation, "deny", "scope_mismatch");
}

function internalDecision(operation: AuthorityOperation): AuthorityOperationDecision {
  return decision(operation, "local", "allowed_local");
}

function externalDecision(facts: Extract<AuthorityFacts, { kind: "external" }>, operation: AuthorityOperation, accountOperational: boolean) {
  if (operation === "view_order") return decision(operation, "local", "allowed_local");
  if (operation === "mark_paid") {
    return facts.paymentOwner === "provider"
      ? decision(operation, "provider_event", "payment_owned_by_provider", null, false)
      : decision(operation, "local", "allowed_local");
  }
  if (operation === "offer_pedeaqui_pix") {
    return decision(operation, "deny", "pedeaqui_pix_forbidden_for_marketplace");
  }
  if (operation === "assign_delivery" || operation === "advance_delivery") {
    return externalLogisticsOwners.has(facts.logisticsOwner)
      ? decision(operation, "provider_event", "logistics_owned_externally", null, false)
      : decision(operation, "local", "allowed_local");
  }

  const command = lifecycleCommands[operation];
  if (!command || facts.provider !== "ifood") return decision(operation, "deny", "operation_not_supported");
  if (!accountOperational) return decision(operation, "deny", "account_not_operational", command);
  return decision(operation, "provider_command", "provider_command_required", command, false);
}

export class AuthorityResolver {
  static resolve(context: IntelligenceContext, facts: AuthorityFacts): AuthoritySnapshot {
    const scoped = context.organizationId === facts.organizationId
      && context.storeId === facts.storeId
      && (!context.activeReferences.orderId || context.activeReferences.orderId === facts.orderId);
    const accountScoped = facts.kind === "internal"
      || (facts.integrationAccountId === facts.account.id
        && facts.organizationId === facts.account.organizationId
        && facts.storeId === facts.account.storeId);
    const accountOperational = facts.kind === "external"
      && (facts.account.status === "connected" || facts.account.status === "attention")
      && facts.account.connectionState === "connected";

    const decisions = Object.fromEntries(authorityOperations.map((operation) => {
      if (!scoped || !accountScoped) return [operation, deniedScope(operation)];
      return [operation, facts.kind === "internal"
        ? internalDecision(operation)
        : externalDecision(facts, operation, accountOperational)];
    })) as Record<AuthorityOperation, AuthorityOperationDecision>;

    const syncStatus = facts.kind === "external" ? facts.syncStatus : null;
    const confirmationState = facts.kind === "internal" || syncStatus === "synced"
      ? "confirmed"
      : syncStatus === "attention" || syncStatus === "retry"
        ? "attention"
        : "pending";

    return {
      key: [facts.kind, facts.orderId, facts.kind === "external" ? facts.integrationAccountId : "pedeaqui"].join(":"),
      organizationId: facts.organizationId,
      storeId: facts.storeId,
      orderId: facts.orderId,
      orderAuthority: facts.kind === "external" ? "provider" : "pedeaqui",
      paymentAuthority: facts.kind === "external" ? facts.paymentOwner : "pedeaqui",
      logisticsAuthority: facts.kind === "external" ? facts.logisticsOwner : "pedeaqui",
      provider: facts.kind === "external" ? facts.provider : null,
      integrationAccountId: facts.kind === "external" ? facts.integrationAccountId : null,
      syncStatus,
      confirmationState,
      allowedLocalOperations: authorityOperations.filter((operation) => decisions[operation].route === "local"),
      decisions,
    };
  }
}

export type AuthorityBoundIntelligenceContext = Omit<IntelligenceContext, "authority"> & {
  authority: { resolved: true; key: string; snapshot: AuthoritySnapshot };
};

export function bindAuthority(
  context: IntelligenceContext,
  snapshot: AuthoritySnapshot,
): AuthorityBoundIntelligenceContext {
  if (context.organizationId !== snapshot.organizationId || context.storeId !== snapshot.storeId) {
    throw new Error("Authority snapshot scope does not match IntelligenceContext");
  }
  if (context.activeReferences.orderId && context.activeReferences.orderId !== snapshot.orderId) {
    throw new Error("Authority snapshot order does not match IntelligenceContext");
  }
  return { ...context, authority: { resolved: true, key: snapshot.key, snapshot } };
}

