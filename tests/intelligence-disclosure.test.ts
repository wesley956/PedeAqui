import { describe, expect, it } from "vitest";
import { createIntelligenceContext, type IntelligenceContextInput } from "@/server/intelligence/context";
import { allowedDisclosure } from "@/server/intelligence/disclosure-policy";
import { projectIdentityForAudience } from "@/server/intelligence/projections";

const organizationId = "30000000-0000-4000-8000-000000000001";
const storeId = "30000000-0000-4000-8000-000000000002";
const customerId = "30000000-0000-4000-8000-000000000003";
const userId = "30000000-0000-4000-8000-000000000004";

function context(overrides: Partial<IntelligenceContextInput> = {}) {
  return createIntelligenceContext({
    requestId: "req", correlationId: "corr", organizationId, storeId, channel: "whatsapp", businessType: "restaurant",
    actor: { type: "customer", userId: null }, audience: "customer", conversation: { id: null, mode: "bot" },
    identity: { source: "whatsapp_contact", trust: "weak", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId: null }, external: { provider: null, accountId: null },
    authority: { resolved: false, key: null }, capabilities: { resolved: false, revision: null }, ...overrides,
  });
}

describe("allowedDisclosure", () => {
  it("does not expose address or history to weak customer identity", () => {
    const weak = context();
    expect(allowedDisclosure(weak, "address")).toBe(false);
    expect(allowedDisclosure(weak, "order_history")).toBe(false);
  });

  it("projects only the exact verified customer", () => {
    const verified = context({ identity: { source: "whatsapp_contact", trust: "verified", contactId: null, customerId } });
    const record = { customerId, displayName: "Ana", phone: "5511999999999", email: null, addresses: [{ street: "A" }], orderHistory: [{ id: "order" }] };
    expect(projectIdentityForAudience(verified, record)).toMatchObject({ displayName: "Ana", addresses: [{ street: "A" }], customerId: null });
    expect(projectIdentityForAudience(verified, { ...record, customerId: "30000000-0000-4000-8000-000000000099" })).toBeNull();
  });

  it("requires privileged merchant identity and explicit RBAC", () => {
    const merchant = context({ channel: "merchant_panel", audience: "merchant", actor: { type: "merchant_user", userId }, identity: { source: "authenticated_user", trust: "privileged", contactId: null, customerId } });
    expect(allowedDisclosure(merchant, "address", { permissions: new Set(["customers.view"]) })).toBe(false);
    expect(allowedDisclosure(merchant, "address", { permissions: new Set(["customers.view_pii"]) })).toBe(true);
    expect(allowedDisclosure(merchant, "order_history", { permissions: new Set(["orders.view"]) })).toBe(true);
  });
});

