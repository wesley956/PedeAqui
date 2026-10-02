import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingWhatsAppContactFromMetadata, billingWhatsAppContactSchema, prepareBillingWhatsAppTemplate, resolveBillingWhatsAppSender } from "@/server/billing/subscription-whatsapp-contract";

const kinds = ["due_soon", "due_today", "overdue", "suspended", "reactivated"] as const;
const templates: Record<typeof kinds[number], string> = { due_soon: "pedeaqui_due_soon", due_today: "pedeaqui_due_today", overdue: "pedeaqui_overdue", suspended: "pedeaqui_suspended", reactivated: "pedeaqui_reactivated" };
const env = {
  PEDEAQUI_BILLING_WHATSAPP_ENABLED: "true",
  PEDEAQUI_BILLING_WHATSAPP_PHONE_NUMBER_ID: "123456789",
  PEDEAQUI_BILLING_WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321",
  PEDEAQUI_BILLING_WHATSAPP_ACCESS_TOKEN: "test-dedicated-token",
  PEDEAQUI_BILLING_WHATSAPP_TEMPLATES: JSON.stringify(templates),
};
const contact = { name: "Responsável financeiro", phone: "5519999999999", enabled: true, consentConfirmed: true };
const approved = kinds.map(kind => ({ name: templates[kind], language: "pt_BR", status: "APPROVED", category: "UTILITY", bodyText: "Aviso", bodyParameterCount: ["suspended", "reactivated"].includes(kind) ? 0 : 2, supported: true }));
const input = { notificationId: "11950000-0000-4000-8000-000000000001", kind: "due_today" as const, contact, sender: resolveBillingWhatsAppSender(env), templates: approved, amountCents: 7990, dueAt: "2026-10-02T12:00:00Z" };

describe("official billing WhatsApp foundation", () => {
  it("is disabled by default and never falls back to a restaurant token", () => {
    expect(resolveBillingWhatsAppSender({ WHATSAPP_ACCESS_TOKEN: "restaurant-token" })).toEqual({ ready: false, reason: "disabled" });
    expect(resolveBillingWhatsAppSender({ ...env, PEDEAQUI_BILLING_WHATSAPP_ACCESS_TOKEN: undefined, WHATSAPP_ACCESS_TOKEN: "restaurant-token" })).toEqual({ ready: false, reason: "invalid_configuration" });
    expect(JSON.stringify(resolveBillingWhatsAppSender(env))).not.toContain("test-dedicated-token");
  });
  it("requires explicit financial contact and consent instead of using organization phone", () => {
    expect(billingWhatsAppContactFromMetadata({ phone: contact.phone, email: "owner@example.com" })).toBeNull();
    expect(billingWhatsAppContactSchema.safeParse({ ...contact, consentConfirmed: false }).success).toBe(false);
    expect(prepareBillingWhatsAppTemplate({ ...input, contact: { ...contact, enabled: false } })).toMatchObject({ ready: false, reason: "financial_contact_missing" });
  });
  it.each(kinds)("prepares %s with a stable key and canonical recipient", kind => {
    const result = prepareBillingWhatsAppTemplate({ ...input, kind });
    expect(result).toMatchObject({ ready: true, recipient: contact.phone, phoneNumberId: env.PEDEAQUI_BILLING_WHATSAPP_PHONE_NUMBER_ID, templateName: templates[kind], idempotencyKey: `subscription-billing-whatsapp:${input.notificationId}` });
    if (result.ready) expect(result.bodyParameters).toHaveLength(["suspended", "reactivated"].includes(kind) ? 0 : 2);
    expect(prepareBillingWhatsAppTemplate({ ...input, kind })).toEqual(result);
  });
  it.each([
    { status: "PENDING" }, { category: "MARKETING" }, { language: "en_US" }, { supported: false }, { bodyParameterCount: 1 },
  ])("refuses unapproved or incompatible templates: %j", override => {
    expect(prepareBillingWhatsAppTemplate({ ...input, templates: approved.map(template => ({ ...template, ...override })) })).toMatchObject({ ready: false, reason: "approved_billing_template_missing" });
  });
  it("does not invent invoice amount, date or notification identity", () => {
    expect(prepareBillingWhatsAppTemplate({ ...input, amountCents: null })).toMatchObject({ ready: false, reason: "invoice_invalid" });
    expect(prepareBillingWhatsAppTemplate({ ...input, dueAt: "invalid" })).toMatchObject({ ready: false, reason: "invoice_invalid" });
    expect(prepareBillingWhatsAppTemplate({ ...input, notificationId: "" })).toMatchObject({ ready: false, reason: "notification_invalid" });
  });
});

const mocks = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), current: { metadata: { functional_plan_label: "Plano existente" }, updated_at: "2026-10-02T00:00:00Z" } as { metadata: Record<string, unknown>; updated_at: string } | null, updated: { id: "11950000-0000-4000-8000-000000000002" } as { id: string } | null, writes: [] as unknown[], filters: [] as unknown[] }));
vi.mock("@/server/platform/platform-admin-service", () => ({ PlatformAdminService: { access: mocks.access }, PlatformAuthorizationError: class extends Error {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { SubscriptionWhatsAppContactService } from "@/server/billing/subscription-whatsapp-contact-service";
const saveInput = { organizationId: "11950000-0000-4000-8000-000000000003", subscriptionId: "11950000-0000-4000-8000-000000000002", expectedUpdatedAt: "2026-10-02T00:00:00Z", contact };

describe("financial contact persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writes.length = 0; mocks.filters.length = 0;
    mocks.current = { metadata: { functional_plan_label: "Plano existente" }, updated_at: saveInput.expectedUpdatedAt };
    mocks.updated = { id: saveInput.subscriptionId };
    mocks.access.mockResolvedValue({ role: "super_admin", user: { id: "admin-id" } });
    mocks.from.mockImplementation(() => {
      let writing = false;
      const query = {
        select: () => query,
        eq: (field: string, value: string) => { mocks.filters.push([field, value]); return query; },
        update: (value: unknown) => { writing = true; mocks.writes.push(value); return query; },
        maybeSingle: async () => ({ data: writing ? mocks.updated : mocks.current, error: null }),
      };
      return query;
    });
  });
  it("requires super admin before any database access", async () => {
    mocks.access.mockResolvedValue({ role: "support" });
    await expect(SubscriptionWhatsAppContactService.save(saveInput)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("scopes every read/write and preserves existing metadata and audit identity", async () => {
    await SubscriptionWhatsAppContactService.save(saveInput);
    expect(mocks.filters.filter(value => JSON.stringify(value) === JSON.stringify(["organization_id", saveInput.organizationId]))).toHaveLength(2);
    expect(mocks.writes[0]).toMatchObject({ metadata: { functional_plan_label: "Plano existente", billing_whatsapp_contact: { ...contact, updatedBy: "admin-id" } } });
  });
  it("refuses an unrelated subscription or stale revision without a write", async () => {
    mocks.current = null;
    await expect(SubscriptionWhatsAppContactService.save(saveInput)).rejects.toThrow("billing_contact_conflict");
    expect(mocks.writes).toHaveLength(0);
  });
  it("detects a concurrent update rather than silently overwriting it", async () => {
    mocks.updated = null;
    await expect(SubscriptionWhatsAppContactService.save(saveInput)).rejects.toThrow("billing_contact_conflict");
    expect(mocks.filters).toContainEqual(["updated_at", saveInput.expectedUpdatedAt]);
  });
});
