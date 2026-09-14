import { describe, expect, it } from "vitest";
import { createIntelligenceContext } from "@/server/intelligence/context";

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  store: "10000000-0000-4000-8000-000000000002",
  customer: "10000000-0000-4000-8000-000000000003",
};

describe("IntelligenceContext", () => {
  it("carries scoped references without domain truth snapshots", () => {
    const context = createIntelligenceContext({
      requestId: "req-1", correlationId: "corr-1", organizationId: ids.organization, storeId: ids.store,
      channel: "web", businessType: "restaurant", actor: { type: "customer", userId: null }, audience: "customer",
      conversation: { id: null, mode: "none" },
      identity: { source: "browser_recognition", trust: "verified", contactId: null, customerId: ids.customer },
      activeReferences: { cartId: null, orderId: null }, external: { provider: null, accountId: null },
      authority: { resolved: false, key: null }, capabilities: { resolved: false, revision: null },
    });
    expect(context.organizationId).toBe(ids.organization);
    expect(context).not.toHaveProperty("price");
    expect(context).not.toHaveProperty("paymentStatus");
    expect(context).not.toHaveProperty("balance");
  });

  it("rejects channel/source confusion and customer ids without trust", () => {
    const base = {
      requestId: "req", correlationId: "corr", organizationId: ids.organization, storeId: ids.store,
      channel: "web" as const, businessType: "restaurant", actor: { type: "customer" as const, userId: null }, audience: "customer" as const,
      conversation: { id: null, mode: "none" as const }, activeReferences: { cartId: null, orderId: null },
      external: { provider: null, accountId: null }, authority: { resolved: false, key: null }, capabilities: { resolved: false, revision: null },
    };
    expect(() => createIntelligenceContext({ ...base, identity: { source: "whatsapp_contact", trust: "verified", contactId: null, customerId: ids.customer } })).toThrow();
    expect(() => createIntelligenceContext({ ...base, identity: { source: "anonymous", trust: "none", contactId: null, customerId: ids.customer } })).toThrow();
  });
});

