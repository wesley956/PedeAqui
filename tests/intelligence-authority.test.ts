import { describe, expect, it } from "vitest";
import { AuthorityResolver, bindAuthority, type AuthorityFacts } from "@/server/intelligence/authority";
import { createIntelligenceContext } from "@/server/intelligence/context";

const organizationId = "50000000-0000-4000-8000-000000000001";
const storeId = "50000000-0000-4000-8000-000000000002";
const orderId = "50000000-0000-4000-8000-000000000003";
const accountId = "50000000-0000-4000-8000-000000000004";

function context(overrides: { organizationId?: string; storeId?: string; orderId?: string | null } = {}) {
  return createIntelligenceContext({
    requestId: "req", correlationId: "corr", organizationId: overrides.organizationId ?? organizationId,
    storeId: overrides.storeId ?? storeId, channel: "merchant_panel", businessType: "restaurant",
    actor: { type: "merchant_user", userId: "50000000-0000-4000-8000-000000000005" }, audience: "merchant",
    conversation: { id: null, mode: "none" },
    identity: { source: "authenticated_user", trust: "privileged", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId: overrides.orderId === undefined ? orderId : overrides.orderId },
    external: { provider: null, accountId: null }, authority: { resolved: false, key: null },
    capabilities: { resolved: true, revision: "cap:1" },
  });
}

function external(overrides: Partial<Extract<AuthorityFacts, { kind: "external" }>> = {}): Extract<AuthorityFacts, { kind: "external" }> {
  return {
    kind: "external", organizationId, storeId, orderId, provider: "ifood", integrationAccountId: accountId,
    account: { id: accountId, organizationId, storeId, status: "connected", connectionState: "connected" },
    paymentOwner: "provider", logisticsOwner: "ifood", syncStatus: "synced", ...overrides,
  };
}

describe("AuthorityResolver", () => {
  it("keeps internal orders on canonical local services", () => {
    const snapshot = AuthorityResolver.resolve(context(), { kind: "internal", organizationId, storeId, orderId });
    expect(snapshot.orderAuthority).toBe("pedeaqui");
    expect(snapshot.decisions.confirm_order).toMatchObject({ route: "local", confirmed: true });
    expect(snapshot.decisions.mark_paid.route).toBe("local");
  });

  it("routes iFood lifecycle to existing commands without claiming confirmation", () => {
    const snapshot = AuthorityResolver.resolve(context(), external());
    expect(snapshot.decisions.confirm_order).toMatchObject({
      allowed: true, route: "provider_command", requiredProviderCommand: "confirm", confirmed: false,
    });
    expect(snapshot.decisions.start_production.requiredProviderCommand).toBe("start_preparation");
    expect(snapshot.decisions.cancel_order.requiredProviderCommand).toBe("request_cancellation");
  });

  it("never marks provider-owned payment locally and never offers PedeAqui Pix to marketplace imports", () => {
    const snapshot = AuthorityResolver.resolve(context(), external());
    expect(snapshot.decisions.mark_paid).toMatchObject({ route: "provider_event", confirmed: false, reason: "payment_owned_by_provider" });
    expect(snapshot.decisions.offer_pedeaqui_pix).toMatchObject({ allowed: false, route: "deny" });
  });

  it("supports mixed merchant payment while retaining external logistics ownership", () => {
    const snapshot = AuthorityResolver.resolve(context(), external({ paymentOwner: "merchant", logisticsOwner: "99entrega" }));
    expect(snapshot.decisions.mark_paid.route).toBe("local");
    expect(snapshot.decisions.assign_delivery).toMatchObject({ route: "provider_event", reason: "logistics_owned_externally" });
  });

  it("allows local logistics only when ownership is local", () => {
    const snapshot = AuthorityResolver.resolve(context(), external({ logisticsOwner: "merchant" }));
    expect(snapshot.decisions.assign_delivery.route).toBe("local");
    expect(snapshot.decisions.advance_delivery.route).toBe("local");
  });

  it.each([
    ["disconnected", "disconnected"],
    ["action_required", "action_required"],
  ] as const)("denies provider commands when account is %s", (status, connectionState) => {
    const snapshot = AuthorityResolver.resolve(context(), external({
      account: { id: accountId, organizationId, storeId, status, connectionState },
    }));
    expect(snapshot.decisions.confirm_order).toMatchObject({ allowed: false, reason: "account_not_operational", confirmed: false });
  });

  it.each([
    ["pending", "pending"],
    ["retry", "attention"],
    ["attention", "attention"],
    ["synced", "confirmed"],
  ] as const)("represents sync %s without false success", (syncStatus, confirmationState) => {
    expect(AuthorityResolver.resolve(context(), external({ syncStatus })).confirmationState).toBe(confirmationState);
  });

  it("fails closed for another tenant, store or integration account", () => {
    const other = "50000000-0000-4000-8000-000000000099";
    expect(AuthorityResolver.resolve(context({ storeId: other }), external()).decisions.confirm_order.reason).toBe("scope_mismatch");
    expect(AuthorityResolver.resolve(context(), external({
      account: { id: accountId, organizationId, storeId: other, status: "connected", connectionState: "connected" },
    })).decisions.confirm_order.reason).toBe("scope_mismatch");
  });

  it("fails closed for providers without a command contract", () => {
    const snapshot = AuthorityResolver.resolve(context(), external({ provider: "99food" }));
    expect(snapshot.decisions.confirm_order).toMatchObject({ allowed: false, reason: "operation_not_supported" });
  });

  it("binds structured authority to the exact IntelligenceContext", () => {
    const base = context();
    const snapshot = AuthorityResolver.resolve(base, external());
    const bound = bindAuthority(base, snapshot);
    expect(bound.authority).toMatchObject({ resolved: true, key: snapshot.key, snapshot });
    expect(() => bindAuthority(context({ orderId: "50000000-0000-4000-8000-000000000099" }), snapshot)).toThrow();
  });
});

