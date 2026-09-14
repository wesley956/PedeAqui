import { describe, expect, it, vi } from "vitest";
import type { IntelligenceContext } from "@/server/intelligence/context";
import type { CapabilitySnapshot, IntelligenceCapabilityKey } from "@/server/intelligence/capability";
import type { AuthoritySnapshot, AuthorityOperation } from "@/server/intelligence/authority";
import type { DeliveryQuote } from "@/server/delivery/quote-calculator";
import {
  DeliveryAdapter,
  DeliveryCapabilityError,
  DeliveryNotFoundError,
  DeliveryScopeError,
  type DeliveryAdapterDependencies,
} from "@/server/intelligence/delivery-adapter";

const organizationId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const driverId = "44444444-4444-4444-8444-444444444444";
const deliveryId = "55555555-5555-4555-8555-555555555555";

function context(overrides: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    requestId: "req-int-07",
    correlationId: "corr-int-07",
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
    capabilities: { resolved: true, revision: "int-07-test" },
    ...overrides,
  };
}

function capabilitySnapshot(options: {
  organizationId?: string;
  storeId?: string;
  quoteAllowed?: boolean;
  trackingAllowed?: boolean;
} = {}): CapabilitySnapshot {
  const keys: IntelligenceCapabilityKey[] = [
    "canAutoReply",
    "canSearchCatalog",
    "canCreateOrder",
    "canQuoteDelivery",
    "canTrackDelivery",
    "canShowGrowthBenefits",
    "canRedeemGrowthBenefits",
    "canOfferPix",
    "canMutateOrder",
    "canViewOperationalHealth",
  ];
  const decisions = Object.fromEntries(keys.map((capability) => {
    const explicitlyDenied = capability === "canQuoteDelivery"
      ? options.quoteAllowed === false
      : capability === "canTrackDelivery"
        ? options.trackingAllowed === false
        : false;
    return [capability, {
      capability,
      allowed: !explicitlyDenied,
      reasons: explicitlyDenied ? ["module_disabled_by_store"] : ["allowed"],
      requiresAuthority: capability === "canMutateOrder",
    }];
  })) as CapabilitySnapshot["decisions"];
  return {
    organizationId: options.organizationId ?? organizationId,
    storeId: options.storeId ?? storeId,
    businessType: "restaurant",
    revision: "int-07-test",
    decisions,
  };
}

function authoritySnapshot(logisticsAuthority: AuthoritySnapshot["logisticsAuthority"] = "pedeaqui"): AuthoritySnapshot {
  const operations: AuthorityOperation[] = [
    "view_order",
    "confirm_order",
    "start_production",
    "mark_ready",
    "cancel_order",
    "mark_paid",
    "offer_pedeaqui_pix",
    "assign_delivery",
    "advance_delivery",
  ];
  const external = logisticsAuthority !== "pedeaqui";
  const decisions = Object.fromEntries(operations.map((operation) => {
    const externalLogisticsMutation = external && (operation === "assign_delivery" || operation === "advance_delivery");
    return [operation, {
      operation,
      allowed: true,
      route: externalLogisticsMutation ? "provider_event" : "local",
      reason: externalLogisticsMutation ? "logistics_owned_externally" : "allowed_local",
      requiredProviderCommand: null,
      confirmed: !externalLogisticsMutation,
    }];
  })) as AuthoritySnapshot["decisions"];
  return {
    key: `authority:${orderId}`,
    organizationId,
    storeId,
    orderId,
    orderAuthority: external ? "provider" : "pedeaqui",
    paymentAuthority: external ? "provider" : "pedeaqui",
    logisticsAuthority,
    provider: external ? "ifood" : null,
    integrationAccountId: external ? "66666666-6666-4666-8666-666666666666" : null,
    syncStatus: external ? "synced" : null,
    confirmationState: "confirmed",
    allowedLocalOperations: operations.filter((operation) => decisions[operation].route === "local"),
    decisions,
  };
}

function operationalRow() {
  return {
    id: orderId,
    display_number: 42,
    customer_name_snapshot: "Cliente",
    customer_phone_snapshot: "19999999999",
    address_street_snapshot: "Rua A",
    address_number_snapshot: "10",
    address_complement_snapshot: null,
    address_district_snapshot: "Centro",
    address_city_snapshot: "Americana",
    address_state_snapshot: "SP",
    address_reference_snapshot: null,
    delivery_fee_cents: 700,
    delivery_estimated_min_minutes: 35,
    delivery_estimated_max_minutes: 55,
    order_status: "confirmed",
    payment_status: "paid",
    production_status: "ready",
    fulfillment_status: "assigned",
    created_at: "2026-09-14T08:00:00.000Z",
    updated_at: "2026-09-14T08:05:00.000Z",
    delivery: {
      id: deliveryId,
      order_id: orderId,
      driver_id: driverId,
      promised_by_at: "2026-09-14T09:00:00.000Z",
      assigned_at: "2026-09-14T08:10:00.000Z",
      picked_up_at: null,
      out_for_delivery_at: null,
      delivered_at: null,
      updated_at: "2026-09-14T08:10:00.000Z",
    },
  };
}

function dependencies(options: {
  quote?: DeliveryQuote;
  operationsContext?: { organizationId: string; storeId: string | null };
  deliveries?: ReturnType<typeof operationalRow>[];
  external?: Record<string, { provider: "ifood" | "99food"; providerLabel: "iFood" | "99Food"; logisticsOwner: "ifood" | "99food" | "99entrega"; logisticsLabel: string }>;
  tracking?: {
    enabled: boolean;
    stationaryMinutes: number;
    routes: Array<{
      id: string;
      driverName: string;
      deliveryCount: number;
      permission: string;
      startedAt: string;
      lastHeartbeatAt: string | null;
      heartbeatAgeMinutes: number | null;
      latest: { latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string } | null;
      noSignal: boolean;
      possiblyStationary: boolean;
    }>;
  };
} = {}) {
  const quote = vi.fn(async () => options.quote ?? ({ serviceable: true, feeCents: 700, estimatedMinMinutes: 35, estimatedMaxMinutes: 55 } as DeliveryQuote));
  const loadOperations = vi.fn(async () => ({
    context: options.operationsContext ?? { organizationId, storeId },
    canManageDrivers: false,
    drivers: [],
    deliveries: options.deliveries ?? [operationalRow()],
  }));
  const loadTracking = vi.fn(async () => options.tracking ?? ({ enabled: true, stationaryMinutes: 15, routes: [] }));
  const externalPresentations = vi.fn(async () => options.external ?? {});
  return {
    mocks: { quote, loadOperations, loadTracking, externalPresentations },
    value: {
      quote: quote as unknown as DeliveryAdapterDependencies["quote"],
      loadOperations: loadOperations as unknown as DeliveryAdapterDependencies["loadOperations"],
      loadTracking: loadTracking as unknown as DeliveryAdapterDependencies["loadTracking"],
      externalPresentations: externalPresentations as unknown as DeliveryAdapterDependencies["externalPresentations"],
    },
  };
}

describe("DeliveryAdapter canonical read projections", () => {
  it.each([
    ["covered", { serviceable: true, feeCents: 700, estimatedMinMinutes: 35, estimatedMaxMinutes: 55 }],
    ["free delivery", { serviceable: true, feeCents: 0, estimatedMinMinutes: 35, estimatedMaxMinutes: 55 }],
    ["minimum order", { serviceable: false, reason: "minimum_order", minimumOrderCents: 3000 }],
    ["unserved neighborhood", { serviceable: false, reason: "neighborhood_not_served" }],
  ] as const)("returns the canonical quote unchanged for %s", async (_scenario, canonicalQuote) => {
    const deps = dependencies({ quote: canonicalQuote as DeliveryQuote });
    const adapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot() }, deps.value);
    const input = { subtotalCents: 4500, address: { district: "Centro", city: "Americana", state: "SP" } };

    await expect(adapter.quote(input)).resolves.toEqual(canonicalQuote);
    expect(deps.mocks.quote).toHaveBeenCalledOnce();
    expect(deps.mocks.quote).toHaveBeenCalledWith({ organizationId, storeId, ...input });
  });

  it("blocks quote before touching the canonical service when capability is disabled", async () => {
    const deps = dependencies();
    const adapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot({ quoteAllowed: false }) }, deps.value);

    await expect(adapter.quote({ subtotalCents: 1000, address: { district: "Centro", city: "Americana", state: "SP" } }))
      .rejects.toBeInstanceOf(DeliveryCapabilityError);
    expect(deps.mocks.quote).not.toHaveBeenCalled();
  });

  it("fails closed when the capability snapshot belongs to another tenant", async () => {
    const deps = dependencies();
    const adapter = new DeliveryAdapter(context(), {
      capabilitySnapshot: capabilitySnapshot({ organizationId: "77777777-7777-4777-8777-777777777777" }),
    }, deps.value);

    await expect(adapter.tracking()).rejects.toBeInstanceOf(DeliveryScopeError);
    expect(deps.mocks.loadTracking).not.toHaveBeenCalled();
  });

  it("projects status from the canonical operational row and preserves external logistics authority", async () => {
    const external = {
      [orderId]: {
        provider: "ifood" as const,
        providerLabel: "iFood" as const,
        logisticsOwner: "ifood" as const,
        logisticsLabel: "Entrega iFood",
      },
    };
    const deps = dependencies({ external });
    const adapter = new DeliveryAdapter(context(), {
      capabilitySnapshot: capabilitySnapshot(),
      authoritySnapshot: authoritySnapshot("ifood"),
    }, deps.value);

    await expect(adapter.status(orderId)).resolves.toMatchObject({
      orderId,
      displayNumber: 42,
      fulfillmentStatus: "assigned",
      productionStatus: "ready",
      orderStatus: "confirmed",
      paymentStatus: "paid",
      estimatedMinMinutes: 35,
      estimatedMaxMinutes: 55,
      delivery: { id: deliveryId, driverId },
      external: external[orderId],
      logisticsAuthority: "ifood",
      localAssignmentAllowed: false,
      localAdvanceAllowed: false,
    });
    expect(deps.mocks.externalPresentations).toHaveBeenCalledWith([orderId]);
  });

  it("blocks order-reference and canonical-operation tenant mismatches", async () => {
    const referenceDeps = dependencies();
    const referenceAdapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot() }, referenceDeps.value);
    await expect(referenceAdapter.status("88888888-8888-4888-8888-888888888888")).rejects.toBeInstanceOf(DeliveryScopeError);
    expect(referenceDeps.mocks.loadOperations).not.toHaveBeenCalled();

    const scopeDeps = dependencies({ operationsContext: { organizationId: "99999999-9999-4999-8999-999999999999", storeId } });
    const scopeAdapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot() }, scopeDeps.value);
    await expect(scopeAdapter.status(orderId)).rejects.toBeInstanceOf(DeliveryScopeError);
    expect(scopeDeps.mocks.externalPresentations).not.toHaveBeenCalled();
  });

  it("does not fabricate a status when the canonical operational domain has no matching order", async () => {
    const deps = dependencies({ deliveries: [] });
    const adapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot() }, deps.value);

    await expect(adapter.status(orderId)).rejects.toBeInstanceOf(DeliveryNotFoundError);
    expect(deps.mocks.externalPresentations).not.toHaveBeenCalled();
  });

  it("fails closed when authority belongs to another order", async () => {
    const deps = dependencies();
    const invalidAuthority = { ...authoritySnapshot(), orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const adapter = new DeliveryAdapter(context(), {
      capabilitySnapshot: capabilitySnapshot(),
      authoritySnapshot: invalidAuthority,
    }, deps.value);

    await expect(adapter.status(orderId)).rejects.toBeInstanceOf(DeliveryScopeError);
  });

  it("exposes tracking only when canonical tracking is enabled, permitted, located and fresh", async () => {
    const capturedAt = "2026-09-14T08:20:00.000Z";
    const deps = dependencies({
      tracking: {
        enabled: true,
        stationaryMinutes: 15,
        routes: [
          { id: "route-ok", driverName: "A", deliveryCount: 1, permission: "granted", startedAt: capturedAt, lastHeartbeatAt: capturedAt, heartbeatAgeMinutes: 1, latest: { latitude: -22.74, longitude: -47.33, accuracy_meters: 8, captured_at: capturedAt }, noSignal: false, possiblyStationary: false },
          { id: "route-denied", driverName: "B", deliveryCount: 1, permission: "denied", startedAt: capturedAt, lastHeartbeatAt: capturedAt, heartbeatAgeMinutes: 1, latest: { latitude: -22.75, longitude: -47.34, accuracy_meters: 8, captured_at: capturedAt }, noSignal: false, possiblyStationary: false },
          { id: "route-empty", driverName: "C", deliveryCount: 1, permission: "granted", startedAt: capturedAt, lastHeartbeatAt: capturedAt, heartbeatAgeMinutes: 1, latest: null, noSignal: false, possiblyStationary: false },
          { id: "route-stale", driverName: "D", deliveryCount: 1, permission: "granted", startedAt: capturedAt, lastHeartbeatAt: null, heartbeatAgeMinutes: null, latest: { latitude: -22.76, longitude: -47.35, accuracy_meters: 8, captured_at: capturedAt }, noSignal: true, possiblyStationary: false },
        ],
      },
    });
    const adapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot() }, deps.value);

    const result = await adapter.tracking();
    expect(result.routes[0]).toMatchObject({ available: true, unavailableReason: null, latest: { latitude: -22.74, longitude: -47.33 } });
    expect(result.routes[1]).toMatchObject({ available: false, unavailableReason: "permission_not_granted", latest: null });
    expect(result.routes[2]).toMatchObject({ available: false, unavailableReason: "no_location", latest: null });
    expect(result.routes[3]).toMatchObject({ available: false, unavailableReason: "no_signal", latest: null });
  });

  it("marks every route unavailable without leaking coordinates when tracking is globally disabled", async () => {
    const capturedAt = "2026-09-14T08:20:00.000Z";
    const deps = dependencies({
      tracking: {
        enabled: false,
        stationaryMinutes: 15,
        routes: [{ id: "route-disabled", driverName: "A", deliveryCount: 1, permission: "granted", startedAt: capturedAt, lastHeartbeatAt: capturedAt, heartbeatAgeMinutes: 1, latest: { latitude: -22.74, longitude: -47.33, accuracy_meters: 8, captured_at: capturedAt }, noSignal: false, possiblyStationary: false }],
      },
    });
    const adapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot() }, deps.value);

    const result = await adapter.tracking();
    expect(result.routes[0]).toMatchObject({ available: false, unavailableReason: "tracking_disabled", latest: null });
  });

  it("blocks tracking before reading location when the delivery module/capability is unavailable", async () => {
    const deps = dependencies();
    const adapter = new DeliveryAdapter(context(), { capabilitySnapshot: capabilitySnapshot({ trackingAllowed: false }) }, deps.value);

    await expect(adapter.tracking()).rejects.toBeInstanceOf(DeliveryCapabilityError);
    expect(deps.mocks.loadTracking).not.toHaveBeenCalled();
  });
});
