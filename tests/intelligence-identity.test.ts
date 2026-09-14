import { describe, expect, it, vi } from "vitest";
import { CustomerIdentityResolver, type CustomerIdentityPorts } from "@/server/intelligence/identity";

const orgA = "20000000-0000-4000-8000-000000000001";
const orgB = "20000000-0000-4000-8000-000000000002";
const storeA = "20000000-0000-4000-8000-000000000003";
const storeB = "20000000-0000-4000-8000-000000000004";
const customerA = "20000000-0000-4000-8000-000000000005";
const contactA = "20000000-0000-4000-8000-000000000006";

function ports(): CustomerIdentityPorts {
  return {
    resolveBrowserRecognition: vi.fn(async ({ organizationId, storeId }) => organizationId === orgA && storeId === storeA ? { customerId: customerA } : null),
    resolveWhatsAppContact: vi.fn(async ({ organizationId, storeId, contactId }) => organizationId === orgA && storeId === storeA && contactId === contactA ? { customerId: customerA } : null),
    resolveAuthenticatedUser: vi.fn(async () => ({ authorized: false })),
    resolveManualAuthorizedLink: vi.fn(async () => ({ authorized: false })),
  };
}

describe("CustomerIdentityResolver", () => {
  it("does not cross tenants or stores even for the same external phone", async () => {
    const resolver = new CustomerIdentityResolver(ports());
    const token = "x".repeat(32);
    await expect(resolver.fromBrowser({ organizationId: orgA, storeId: storeA, token })).resolves.toMatchObject({ customerId: customerA, trust: "verified" });
    await expect(resolver.fromBrowser({ organizationId: orgB, storeId: storeA, token })).resolves.toMatchObject({ customerId: null, trust: "none" });
    await expect(resolver.fromWhatsAppContact({ organizationId: orgA, storeId: storeB, contactId: contactA })).resolves.toMatchObject({ customerId: null, trust: "weak" });
  });

  it("keeps browser recognition and WhatsApp contact as distinct evidence", async () => {
    const adapters = ports();
    const resolver = new CustomerIdentityResolver(adapters);
    const browser = await resolver.fromBrowser({ organizationId: orgA, storeId: storeA, token: "x".repeat(32) });
    const whatsapp = await resolver.fromWhatsAppContact({ organizationId: orgA, storeId: storeA, contactId: contactA });
    expect(browser.source).toBe("browser_recognition");
    expect(whatsapp.source).toBe("whatsapp_contact");
    expect(adapters.resolveBrowserRecognition).toHaveBeenCalledOnce();
    expect(adapters.resolveWhatsAppContact).toHaveBeenCalledOnce();
  });
});

