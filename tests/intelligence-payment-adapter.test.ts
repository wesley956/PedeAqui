import { describe, expect, it, vi } from "vitest";
import type { AuthoritySnapshot } from "@/server/intelligence/authority";
import type { IntelligenceContext } from "@/server/intelligence/context";
import { resolveCashTendered } from "@/server/payments/payment-model";

vi.mock("@/server/payments/payment-service", () => ({
  PaymentService: { listForOrder: async () => { throw new Error("mock required"); } },
}));
vi.mock("@/server/payments/order-pix-service", () => ({
  OrderPixService: { getExistingForOrder: async () => null },
}));
vi.mock("@/server/payments/store-payment-method-service", () => ({
  StorePaymentMethodService: { listForStore: async () => [] },
}));

import {
  INTELLIGENCE_PAYMENT_TOOLS,
  PaymentAdapter,
  PaymentScopeError,
  type PaymentAdapterDependencies,
} from "@/server/intelligence/payment-adapter";

const organizationId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const customMethodId = "44444444-4444-4444-8444-444444444444";

function context(overrides: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    requestId: "req-int-08",
    correlationId: "corr-int-08",
    organizationId,
    storeId,
    channel: "system",
    businessType: "restaurant",
    actor: { type: "system", userId: null },
    audience: "system",
    conversation: { id: null, mode: "none" },
    identity: { source: "system", trust: "privileged", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId },
    external: { provider: null, accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: true, revision: "int-08-test" },
    ...overrides,
  };
}

function canonicalRead(options: {
  organizationId?: string;
  storeId?: string;
  paymentStatus?: string;
  totalCents?: number;
  payments?: Array<Record<string, unknown>>;
} = {}) {
  const totalCents = options.totalCents ?? 5_000;
  return {
    context: {
      organizationId: options.organizationId ?? organizationId,
      storeId: options.storeId ?? storeId,
    },
    order: {
      id: orderId,
      total_cents: totalCents,
      payment_status: options.paymentStatus ?? "pending",
    },
    payments: options.payments ?? [{
      id: "payment-secret-id",
      order_id: orderId,
      method: "pix",
      status: "pending",
      amount_cents: totalCents,
      cash_tendered_cents: null,
      change_due_cents: null,
      reference: "provider-secret-reference",
      source: "integration",
      paid_at: null,
      failed_at: null,
      refunded_at: null,
      created_at: "2026-09-14T20:00:00.000Z",
      updated_at: "2026-09-14T20:00:00.000Z",
    }],
    summary: {
      paidCents: 0,
      reservedCents: totalCents,
      failedCents: 0,
      remainingCents: totalCents,
      availableToReserveCents: 0,
      settled: false,
    },
  };
}

function authority(options: {
  organizationId?: string;
  storeId?: string;
  orderId?: string;
  paymentAuthority?: AuthoritySnapshot["paymentAuthority"];
  pixRoute?: AuthoritySnapshot["decisions"]["offer_pedeaqui_pix"]["route"];
  provider?: AuthoritySnapshot["provider"];
} = {}): AuthoritySnapshot {
  const paymentAuthority = options.paymentAuthority ?? "pedeaqui";
  const provider = options.provider ?? (paymentAuthority === "provider" ? "ifood" : null);
  const route = options.pixRoute ?? (provider ? "deny" : "local");
  return {
    key: "authority:int-08",
    organizationId: options.organizationId ?? organizationId,
    storeId: options.storeId ?? storeId,
    orderId: options.orderId ?? orderId,
    orderAuthority: provider ? "provider" : "pedeaqui",
    paymentAuthority,
    logisticsAuthority: provider ? "ifood" : "pedeaqui",
    provider,
    integrationAccountId: provider ? "55555555-5555-4555-8555-555555555555" : null,
    syncStatus: provider ? "synced" : null,
    confirmationState: "confirmed",
    allowedLocalOperations: [],
    decisions: {
      view_order: { operation: "view_order", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
      confirm_order: { operation: "confirm_order", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
      start_production: { operation: "start_production", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
      mark_ready: { operation: "mark_ready", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
      cancel_order: { operation: "cancel_order", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
      mark_paid: {
        operation: "mark_paid",
        allowed: paymentAuthority !== "provider",
        route: paymentAuthority === "provider" ? "provider_event" : "local",
        reason: paymentAuthority === "provider" ? "payment_owned_by_provider" : "allowed_local",
        requiredProviderCommand: null,
        confirmed: paymentAuthority !== "provider",
      },
      offer_pedeaqui_pix: {
        operation: "offer_pedeaqui_pix",
        allowed: route !== "deny",
        route,
        reason: route === "deny" ? "pedeaqui_pix_forbidden_for_marketplace" : "allowed_local",
        requiredProviderCommand: null,
        confirmed: route === "local",
      },
      assign_delivery: { operation: "assign_delivery", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
      advance_delivery: { operation: "advance_delivery", allowed: true, route: "local", reason: "allowed_local", requiredProviderCommand: null, confirmed: true },
    },
  };
}

function dependencies(options: {
  methods?: Array<Record<string, unknown>>;
  read?: ReturnType<typeof canonicalRead>;
  pix?: {
    status: "preparing" | "waiting" | "paid" | "expired" | "unavailable";
    amountCents: number;
    qrCode: string | null;
    qrCodeBase64: string | null;
    ticketUrl: string | null;
    expiresAt: string | null;
  } | null;
} = {}) {
  const listMethods = vi.fn(async () => options.methods ?? [
    { method: "pix", enabled: true, sortOrder: 10 },
    { method: "credit_card", enabled: true, sortOrder: 20 },
    { method: "debit_card", enabled: false, sortOrder: 30 },
    { method: "cash", enabled: true, sortOrder: 40 },
    { method: "custom", enabled: true, sortOrder: 100, customPaymentMethodId: customMethodId, label: "Ticket" },
  ]);
  const listForOrder = vi.fn(async () => options.read ?? canonicalRead());
  const getExistingPix = vi.fn(async () => options.pix ?? null);
  return {
    mocks: { listMethods, listForOrder, getExistingPix },
    value: {
      listMethods: listMethods as unknown as PaymentAdapterDependencies["listMethods"],
      listForOrder: listForOrder as unknown as PaymentAdapterDependencies["listForOrder"],
      getExistingPix: getExistingPix as unknown as PaymentAdapterDependencies["getExistingPix"],
      resolveCash: resolveCashTendered,
    } satisfies PaymentAdapterDependencies,
  };
}

describe("PaymentAdapter canonical read projections", () => {
  it("declares the four INT-08 read/simulation tools and exposes only accepted canonical methods", async () => {
    expect(INTELLIGENCE_PAYMENT_TOOLS).toEqual([
      "payment.methods.get",
      "payment.pix.get",
      "payment.change.validate",
      "payment.status.get",
    ]);
    const deps = dependencies();
    const adapter = new PaymentAdapter(context(), null, deps.value);

    await expect(adapter.methods()).resolves.toEqual([
      { id: "pix", method: "pix", label: "Pix", custom: false },
      { id: "credit_card", method: "credit_card", label: "Cartão de crédito", custom: false },
      { id: "cash", method: "cash", label: "Dinheiro", custom: false },
      { id: customMethodId, method: "custom", label: "Ticket", custom: true },
    ]);
    expect(deps.mocks.listMethods).toHaveBeenCalledWith(organizationId, storeId);
  });

  it("preserves the sanitized existing Pix projection without creating or reconciling a charge", async () => {
    const pix = {
      status: "waiting" as const,
      amountCents: 5_000,
      qrCode: "000201-pix-copy-paste",
      qrCodeBase64: "base64-public-qr",
      ticketUrl: "https://example.test/pix",
      expiresAt: "2026-09-14T21:00:00.000Z",
    };
    const deps = dependencies({ pix });
    const adapter = new PaymentAdapter(context(), authority(), deps.value);

    await expect(adapter.pix(orderId)).resolves.toEqual(pix);
    expect(deps.mocks.listForOrder).toHaveBeenCalledWith(orderId);
    expect(deps.mocks.getExistingPix).toHaveBeenCalledWith(orderId);
    expect(Object.keys(deps.value).sort()).toEqual(["getExistingPix", "listForOrder", "listMethods", "resolveCash"]);
  });

  it.each(["preparing", "waiting", "paid", "expired", "unavailable"] as const)(
    "keeps canonical Pix status %s unchanged",
    async (status) => {
      const deps = dependencies({ pix: {
        status,
        amountCents: 5_000,
        qrCode: status === "waiting" ? "copy-paste" : null,
        qrCodeBase64: null,
        ticketUrl: null,
        expiresAt: null,
      } });
      const adapter = new PaymentAdapter(context(), authority(), deps.value);
      await expect(adapter.pix(orderId)).resolves.toMatchObject({ status });
    },
  );

  it("returns no local Pix and does not read a local charge when payment authority belongs to the provider", async () => {
    const deps = dependencies({ pix: {
      status: "waiting",
      amountCents: 5_000,
      qrCode: "must-not-leak",
      qrCodeBase64: null,
      ticketUrl: null,
      expiresAt: null,
    } });
    const adapter = new PaymentAdapter(context(), authority({ paymentAuthority: "provider", provider: "ifood", pixRoute: "deny" }), deps.value);

    await expect(adapter.pix(orderId)).resolves.toBeNull();
    expect(deps.mocks.getExistingPix).not.toHaveBeenCalled();
  });

  it("fails closed before sensitive reads when the active order reference or canonical tenant scope diverges", async () => {
    const activeDeps = dependencies();
    const activeAdapter = new PaymentAdapter(context({
      activeReferences: { cartId: null, orderId: "66666666-6666-4666-8666-666666666666" },
    }), null, activeDeps.value);
    await expect(activeAdapter.status(orderId)).rejects.toBeInstanceOf(PaymentScopeError);
    expect(activeDeps.mocks.listForOrder).not.toHaveBeenCalled();

    const tenantDeps = dependencies({ read: canonicalRead({ organizationId: "77777777-7777-4777-8777-777777777777" }) });
    const tenantAdapter = new PaymentAdapter(context(), null, tenantDeps.value);
    await expect(tenantAdapter.status(orderId)).rejects.toBeInstanceOf(PaymentScopeError);
  });

  it("fails closed when the authority snapshot belongs to another order", async () => {
    const deps = dependencies();
    const adapter = new PaymentAdapter(context(), authority({ orderId: "88888888-8888-4888-8888-888888888888" }), deps.value);
    await expect(adapter.pix(orderId)).rejects.toBeInstanceOf(PaymentScopeError);
    expect(deps.mocks.getExistingPix).not.toHaveBeenCalled();
  });

  it("validates exact cash and change above the total with the canonical cash rule", async () => {
    const deps = dependencies({ read: canonicalRead({ totalCents: 4_250 }) });
    const adapter = new PaymentAdapter(context(), null, deps.value);

    await expect(adapter.validateChange(orderId, null)).resolves.toEqual({
      orderId,
      totalCents: 4_250,
      cashTenderedCents: 4_250,
      changeDueCents: 0,
    });
    await expect(adapter.validateChange(orderId, 5_000)).resolves.toEqual({
      orderId,
      totalCents: 4_250,
      cashTenderedCents: 5_000,
      changeDueCents: 750,
    });
    await expect(adapter.validateChange(orderId, 4_000)).rejects.toThrow("Cash received must cover payment amount");
  });

  it("projects official payment status and ledger summary without leaking internal identifiers or references", async () => {
    const read = canonicalRead({
      paymentStatus: "paid",
      payments: [{
        id: "payment-secret-id",
        order_id: orderId,
        method: "pix",
        status: "paid",
        amount_cents: 5_000,
        cash_tendered_cents: null,
        change_due_cents: null,
        reference: "provider-secret-reference",
        source: "integration",
        paid_at: "2026-09-14T20:10:00.000Z",
        failed_at: null,
        refunded_at: null,
        created_at: "2026-09-14T20:00:00.000Z",
        updated_at: "2026-09-14T20:10:00.000Z",
      }],
    });
    read.summary = {
      paidCents: 5_000,
      reservedCents: 5_000,
      failedCents: 0,
      remainingCents: 0,
      availableToReserveCents: 0,
      settled: true,
    };
    const deps = dependencies({ read });
    const adapter = new PaymentAdapter(context(), authority(), deps.value);
    const result = await adapter.status(orderId);

    expect(result).toEqual({
      orderId,
      orderPaymentStatus: "paid",
      totalCents: 5_000,
      summary: read.summary,
      payments: [{
        method: "pix",
        status: "paid",
        amountCents: 5_000,
        cashTenderedCents: null,
        changeDueCents: null,
        paidAt: "2026-09-14T20:10:00.000Z",
        failedAt: null,
        refundedAt: null,
      }],
      authority: { paymentAuthority: "pedeaqui", provider: null },
    });
    expect(JSON.stringify(result)).not.toContain("payment-secret-id");
    expect(JSON.stringify(result)).not.toContain("provider-secret-reference");
    expect(JSON.stringify(result)).not.toContain("integration");
  });

  it("does not expose technical payment authority in the customer projection", async () => {
    const deps = dependencies();
    const adapter = new PaymentAdapter(context({ audience: "customer", actor: { type: "customer", userId: null } }), authority(), deps.value);
    await expect(adapter.status(orderId)).resolves.toMatchObject({ authority: null });
  });
});
