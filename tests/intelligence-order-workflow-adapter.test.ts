import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/orders/order-service", () => ({ OrderService: { get: async () => null } }));
vi.mock("@/server/orders/order-presentation-service", () => ({ OrderPresentationService: { getManagerRow: async () => null } }));
vi.mock("@/server/orders/order-workflow-settings-service", () => ({ OrderWorkflowSettingsService: { get: async () => null } }));
vi.mock("@/server/kitchen/kitchen-service", () => ({ KitchenService: { projection: async () => null } }));
vi.mock("@/server/orders/public-order-service", () => ({ PublicOrderService: { getTracking: async () => null } }));

import { AuthorityResolver } from "@/server/intelligence/authority";
import { createIntelligenceContext, type IntelligenceContext } from "@/server/intelligence/context";
import {
  INTELLIGENCE_ORDER_WORKFLOW_FLAG,
  INTELLIGENCE_ORDER_WORKFLOW_MODE,
  OrderAudienceError,
  OrderProjectionMismatchError,
  OrderWorkflowAdapter,
  OrderWorkflowScopeError,
  type OrderWorkflowAdapterDependencies,
} from "@/server/intelligence/order-workflow-adapter";
import { defaultCustomWorkflowConfig, type CustomWorkflowConfig } from "@/features/orders/workflow-config";

const organizationId = "62000000-0000-4000-8000-000000000001";
const storeId = "62000000-0000-4000-8000-000000000002";
const otherStoreId = "62000000-0000-4000-8000-000000000003";
const userId = "62000000-0000-4000-8000-000000000004";
const orderId = "62000000-0000-4000-8000-000000000010";
const integrationAccountId = "62000000-0000-4000-8000-000000000020";

function merchantContext(overrides: Partial<IntelligenceContext> = {}) {
  return createIntelligenceContext({
    requestId: "order-workflow-test",
    correlationId: "order-workflow-correlation",
    organizationId,
    storeId,
    channel: "merchant_panel",
    businessType: "restaurant",
    actor: { type: "merchant_user", userId },
    audience: "merchant",
    conversation: { id: null, mode: "none" },
    identity: { source: "authenticated_user", trust: "privileged", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId },
    external: { provider: null, accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: true, revision: "cap:orders" },
    ...overrides,
  });
}

function customerContext(currentStoreId = storeId) {
  return createIntelligenceContext({
    requestId: "order-tracking-test",
    correlationId: "order-tracking-correlation",
    organizationId,
    storeId: currentStoreId,
    channel: "web",
    businessType: "restaurant",
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: null, mode: "none" },
    identity: { source: "browser_recognition", trust: "verified", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId },
    external: { provider: null, accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: true, revision: "cap:orders" },
  });
}

function manager(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    display_number: 123,
    channel: "web",
    fulfillment_type: "delivery",
    order_status: "confirmed",
    payment_status: "paid",
    production_status: "preparing",
    fulfillment_status: "pending",
    customer_name_snapshot: "Cliente Teste",
    total_cents: 4500,
    scheduled_for: null,
    created_at: "2026-09-14T10:00:00.000Z",
    updated_at: "2026-09-14T10:10:00.000Z",
    external: null,
    ...overrides,
  };
}

function detail(row = manager(), currentStoreId = storeId) {
  return {
    context: { organizationId, storeId: currentStoreId },
    order: {
      id: row.id,
      order_status: row.order_status,
      payment_status: row.payment_status,
      production_status: row.production_status,
      fulfillment_status: row.fulfillment_status,
    },
  };
}

function workflow(mode: "standard" | "simplified" | "custom" = "standard", custom: CustomWorkflowConfig = defaultCustomWorkflowConfig, currentStoreId = storeId) {
  return {
    context: { organizationId, storeId: currentStoreId },
    settings: { mode, custom },
  };
}

function publicTracking(currentStoreId = storeId) {
  return {
    store: {
      id: currentStoreId,
      organization_id: organizationId,
      name: "Dona Maria",
      slug: "dona-maria",
      business_type: "restaurant",
      timezone: "America/Sao_Paulo",
    },
    order: {
      id: orderId,
      display_number: 123,
      channel: "web",
      fulfillment_type: "delivery",
      order_status: "confirmed",
      payment_status: "paid",
      production_status: "ready",
      fulfillment_status: "awaiting_assignment",
      total_cents: 4500,
      scheduled_for: null,
      delivery_estimated_min_minutes: 30,
      delivery_estimated_max_minutes: 45,
      confirmed_at: "2026-09-14T10:01:00.000Z",
      completed_at: null,
      canceled_at: null,
      created_at: "2026-09-14T10:00:00.000Z",
      updated_at: "2026-09-14T10:10:00.000Z",
    },
  };
}

function dependencies(options: {
  row?: ReturnType<typeof manager>;
  storeId?: string;
  workflowMode?: "standard" | "simplified" | "custom";
  custom?: CustomWorkflowConfig;
  kitchen?: Record<string, unknown> | null;
  publicStoreId?: string;
  publicTrackingSpy?: ReturnType<typeof vi.fn>;
} = {}) {
  const row = options.row ?? manager();
  const getPublicTracking = options.publicTrackingSpy ?? vi.fn(async () => publicTracking(options.publicStoreId ?? storeId));
  return {
    getOrder: vi.fn(async () => detail(row, options.storeId ?? storeId)),
    getManagerRow: vi.fn(async () => row),
    getWorkflowSettings: vi.fn(async () => workflow(options.workflowMode ?? "standard", options.custom ?? defaultCustomWorkflowConfig, options.storeId ?? storeId)),
    getKitchenProjection: vi.fn(async () => options.kitchen === undefined
      ? { id: orderId, productionStatus: row.production_status }
      : options.kitchen),
    getPublicTracking,
  } as unknown as OrderWorkflowAdapterDependencies;
}

const operationalPermissions = new Set(["orders.view", "customers.view"]);

describe("OrderWorkflowAdapter", () => {
  it("is explicitly shadow-gated", () => {
    expect(INTELLIGENCE_ORDER_WORKFLOW_FLAG).toBe("intelligence_canonical_order_workflow");
    expect(INTELLIGENCE_ORDER_WORKFLOW_MODE).toBe("shadow");
  });

  it("uses the token-protected read-only customer tracking projection without operational readers", async () => {
    const deps = dependencies();
    const adapter = new OrderWorkflowAdapter(customerContext(), {}, deps);
    const result = await adapter.tracking(orderId, { storeSlug: "dona-maria", accessToken: "public-token" });

    expect(result).toMatchObject({
      audience: "customer",
      displayNumber: 123,
      orderStatus: "confirmed",
      productionStatus: "ready",
      totalCents: 4500,
      deliveryEstimateMinutes: { min: 30, max: 45 },
    });
    expect(Object.keys(result)).not.toContain("customer_name_snapshot");
    expect(Object.keys(result)).not.toContain("address_street_snapshot");
    expect(deps.getOrder).not.toHaveBeenCalled();
    expect(deps.getManagerRow).not.toHaveBeenCalled();
  });

  it("projects standard delivery status from the canonical workflow visibility", async () => {
    const deps = dependencies();
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, deps);
    const status = await adapter.status(orderId);
    expect(status).toMatchObject({
      displayNumber: 123,
      orderStatus: "confirmed",
      productionStatus: "preparing",
      visibleStage: "preparing",
    });
  });

  it("preserves custom hidden stages and quickFinish instead of inventing an intermediate stage", async () => {
    const custom: CustomWorkflowConfig = {
      delivery: ["new", "finished"],
      pickup: ["new", "finished"],
      quickFinish: true,
    };
    const deps = dependencies({ workflowMode: "custom", custom });
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, deps);
    const projected = await adapter.workflow(orderId);
    expect(projected).toMatchObject({
      mode: "custom",
      rawStage: "preparing",
      visibleStage: "new",
      visibleStages: ["new", "finished"],
      quickFinish: true,
    });
  });

  it.each([
    ["delivery", "standard", ["new", "preparing", "ready", "delivering", "finished"]],
    ["pickup", "simplified", ["new", "ready", "finished"]],
  ] as const)("preserves %s workflow in %s mode", async (fulfillmentType, mode, stages) => {
    const deps = dependencies({ row: manager({ fulfillment_type: fulfillmentType }), workflowMode: mode });
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, deps);
    const projected = await adapter.workflow(orderId);
    expect(projected.mode).toBe(mode);
    expect(projected.visibleStages).toEqual(stages);
  });

  it("keeps production status equal to the official Kitchen projection while the order is active", async () => {
    const deps = dependencies({ kitchen: { id: orderId, productionStatus: "preparing" } });
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, deps);
    await expect(adapter.productionStatus(orderId)).resolves.toMatchObject({
      productionStatus: "preparing",
      inKitchen: true,
    });
  });

  it("fails shadow validation when Kitchen and order projections disagree", async () => {
    const deps = dependencies({ kitchen: { id: orderId, productionStatus: "ready" } });
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, deps);
    await expect(adapter.productionStatus(orderId)).rejects.toBeInstanceOf(OrderProjectionMismatchError);
  });

  it.each(["canceled", "completed"] as const)("keeps finalized order %s outside KDS without changing its official production state", async (orderStatus) => {
    const row = manager({ order_status: orderStatus, production_status: "ready" });
    const deps = dependencies({ row, kitchen: null });
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, deps);
    await expect(adapter.productionStatus(orderId)).resolves.toMatchObject({ productionStatus: "ready", inKitchen: false });
  });

  it("requires orders.view plus privileged merchant/agent context for operational projections", async () => {
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: new Set() }, dependencies());
    await expect(adapter.status(orderId)).rejects.toBeInstanceOf(OrderAudienceError);
  });

  it("fails closed when a canonical reader resolves another store", async () => {
    const adapter = new OrderWorkflowAdapter(merchantContext(), { permissions: operationalPermissions }, dependencies({ storeId: otherStoreId }));
    await expect(adapter.status(orderId)).rejects.toBeInstanceOf(OrderWorkflowScopeError);
  });

  it("fails closed when customer tracking resolves another tenant store", async () => {
    const adapter = new OrderWorkflowAdapter(customerContext(), {}, dependencies({ publicStoreId: otherStoreId }));
    await expect(adapter.tracking(orderId, { storeSlug: "other", accessToken: "token" })).rejects.toBeInstanceOf(OrderWorkflowScopeError);
  });

  it("requires the INT-04 authority snapshot for external orders and preserves provider authority", async () => {
    const externalRow = manager({
      channel: "ifood",
      external: {
        provider: "ifood",
        externalOrderId: "IFOOD-1",
        externalDisplayId: "1234",
        syncStatus: "synced",
        paymentOwner: "provider",
        prepaid: true,
        logisticsOwner: "ifood",
        timing: "immediate",
        recommendedPreparationAt: null,
      },
    });
    const context = merchantContext({ external: { provider: "ifood", accountId: integrationAccountId } });
    const deps = dependencies({ row: externalRow });
    const withoutAuthority = new OrderWorkflowAdapter(context, { permissions: operationalPermissions }, deps);
    await expect(withoutAuthority.status(orderId)).rejects.toBeInstanceOf(OrderAudienceError);

    const authority = AuthorityResolver.resolve(context, {
      kind: "external",
      organizationId,
      storeId,
      orderId,
      provider: "ifood",
      integrationAccountId,
      account: {
        id: integrationAccountId,
        organizationId,
        storeId,
        status: "connected",
        connectionState: "connected",
      },
      paymentOwner: "provider",
      logisticsOwner: "ifood",
      syncStatus: "synced",
    });
    const withAuthority = new OrderWorkflowAdapter(context, { permissions: operationalPermissions, authoritySnapshot: authority }, deps);
    await expect(withAuthority.status(orderId)).resolves.toMatchObject({
      external: { provider: "ifood", syncStatus: "synced" },
      authority: { orderAuthority: "provider", provider: "ifood", confirmationState: "confirmed" },
    });
  });
});