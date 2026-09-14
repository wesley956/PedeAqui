import type { DeliveryQuote } from "@/server/delivery/quote-calculator";
import { DeliveryQuoteService } from "@/server/delivery/delivery-quote-service";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import {
  ExternalDeliveryPolicyService,
  type ExternalDeliveryPresentation,
} from "@/server/delivery/external-delivery-policy-service";
import { RouteTrackingService } from "@/server/delivery/route-tracking-service";
import type { AuthoritySnapshot } from "@/server/intelligence/authority";
import type { CapabilitySnapshot } from "@/server/intelligence/capability";
import type { IntelligenceContext } from "@/server/intelligence/context";

export const INTELLIGENCE_CANONICAL_DELIVERY_FLAG = "intelligence_canonical_delivery" as const;
export const INTELLIGENCE_CANONICAL_DELIVERY_MODE = "shadow" as const;

export type DeliveryQuoteInput = {
  subtotalCents: number;
  address: {
    district: string;
    city: string;
    state: string;
  };
};

export type DeliveryStatusProjection = {
  orderId: string;
  displayNumber: number;
  fulfillmentStatus: string;
  productionStatus: string;
  orderStatus: string;
  paymentStatus: string;
  estimatedMinMinutes: number | null;
  estimatedMaxMinutes: number | null;
  delivery: {
    id: string;
    driverId: string | null;
    promisedByAt: string | null;
    assignedAt: string | null;
    pickedUpAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
  } | null;
  external: ExternalDeliveryPresentation | null;
  logisticsAuthority: AuthoritySnapshot["logisticsAuthority"] | null;
  localAssignmentAllowed: boolean;
  localAdvanceAllowed: boolean;
};

export type DeliveryTrackingProjection = {
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
    latest: {
      latitude: number;
      longitude: number;
      accuracy_meters: number | null;
      captured_at: string;
    } | null;
    available: boolean;
    unavailableReason: "tracking_disabled" | "permission_not_granted" | "no_location" | "no_signal" | null;
    noSignal: boolean;
    possiblyStationary: boolean;
  }>;
};

export type DeliveryAdapterAuthorization = {
  capabilitySnapshot: CapabilitySnapshot;
  authoritySnapshot?: AuthoritySnapshot | null;
};

export type DeliveryAdapterDependencies = {
  quote: typeof DeliveryQuoteService.quote;
  loadOperations: typeof DeliveryOperationsService.loadOperations;
  loadTracking: typeof RouteTrackingService.loadOwnerPanel;
  externalPresentations: typeof ExternalDeliveryPolicyService.presentationsForOrders;
};

const defaultDependencies: DeliveryAdapterDependencies = {
  quote: DeliveryQuoteService.quote.bind(DeliveryQuoteService),
  loadOperations: DeliveryOperationsService.loadOperations.bind(DeliveryOperationsService),
  loadTracking: RouteTrackingService.loadOwnerPanel.bind(RouteTrackingService),
  externalPresentations: ExternalDeliveryPolicyService.presentationsForOrders.bind(ExternalDeliveryPolicyService),
};

export class DeliveryScopeError extends Error {
  constructor(message = "Delivery projection is outside the Intelligence context scope") {
    super(message);
    this.name = "DeliveryScopeError";
  }
}

export class DeliveryCapabilityError extends Error {
  constructor(
    readonly capability: "canQuoteDelivery" | "canTrackDelivery",
    readonly reasons: readonly string[],
  ) {
    super(`Delivery capability ${capability} is not allowed: ${reasons.join(", ")}`);
    this.name = "DeliveryCapabilityError";
  }
}

export class DeliveryNotFoundError extends Error {
  constructor(message = "Delivery order was not found in the canonical operational projection") {
    super(message);
    this.name = "DeliveryNotFoundError";
  }
}

function requireCapability(
  context: IntelligenceContext,
  snapshot: CapabilitySnapshot,
  capability: "canQuoteDelivery" | "canTrackDelivery",
) {
  if (snapshot.organizationId !== context.organizationId || snapshot.storeId !== context.storeId) {
    throw new DeliveryScopeError("Capability snapshot scope does not match IntelligenceContext");
  }
  const decision = snapshot.decisions[capability];
  if (!decision.allowed) throw new DeliveryCapabilityError(capability, decision.reasons);
}

function requireOperationalScope(context: IntelligenceContext, operationalContext: { organizationId: string; storeId: string | null }) {
  if (operationalContext.organizationId !== context.organizationId || operationalContext.storeId !== context.storeId) {
    throw new DeliveryScopeError("Canonical delivery operations scope does not match IntelligenceContext");
  }
}

function authorityForOrder(context: IntelligenceContext, snapshot: AuthoritySnapshot | null | undefined, orderId: string) {
  if (!snapshot) return null;
  if (snapshot.organizationId !== context.organizationId || snapshot.storeId !== context.storeId || snapshot.orderId !== orderId) {
    throw new DeliveryScopeError("Authority snapshot scope does not match delivery order");
  }
  return snapshot;
}

export class DeliveryAdapter {
  constructor(
    private readonly context: IntelligenceContext,
    private readonly authorization: DeliveryAdapterAuthorization,
    private readonly dependencies: DeliveryAdapterDependencies = defaultDependencies,
  ) {}

  async quote(input: DeliveryQuoteInput): Promise<DeliveryQuote> {
    requireCapability(this.context, this.authorization.capabilitySnapshot, "canQuoteDelivery");
    return this.dependencies.quote({
      organizationId: this.context.organizationId,
      storeId: this.context.storeId,
      subtotalCents: input.subtotalCents,
      address: input.address,
    });
  }

  async status(orderId: string): Promise<DeliveryStatusProjection> {
    if (this.context.activeReferences.orderId && this.context.activeReferences.orderId !== orderId) {
      throw new DeliveryScopeError("Requested delivery order does not match the active order reference");
    }

    const operations = await this.dependencies.loadOperations();
    requireOperationalScope(this.context, operations.context);
    const row = operations.deliveries.find((candidate) => candidate.id === orderId);
    if (!row) throw new DeliveryNotFoundError();

    const external = (await this.dependencies.externalPresentations([orderId]))[orderId] ?? null;
    const authority = authorityForOrder(this.context, this.authorization.authoritySnapshot, orderId);
    const localAssignmentAllowed = authority
      ? authority.decisions.assign_delivery.route === "local"
      : external === null;
    const localAdvanceAllowed = authority
      ? authority.decisions.advance_delivery.route === "local"
      : external === null;

    return {
      orderId: row.id,
      displayNumber: row.display_number,
      fulfillmentStatus: row.fulfillment_status,
      productionStatus: row.production_status,
      orderStatus: row.order_status,
      paymentStatus: row.payment_status,
      estimatedMinMinutes: row.delivery_estimated_min_minutes,
      estimatedMaxMinutes: row.delivery_estimated_max_minutes,
      delivery: row.delivery ? {
        id: row.delivery.id,
        driverId: row.delivery.driver_id,
        promisedByAt: row.delivery.promised_by_at,
        assignedAt: row.delivery.assigned_at,
        pickedUpAt: row.delivery.picked_up_at,
        outForDeliveryAt: row.delivery.out_for_delivery_at,
        deliveredAt: row.delivery.delivered_at,
      } : null,
      external,
      logisticsAuthority: authority?.logisticsAuthority ?? (external?.logisticsOwner ?? "pedeaqui"),
      localAssignmentAllowed,
      localAdvanceAllowed,
    };
  }

  async tracking(): Promise<DeliveryTrackingProjection> {
    requireCapability(this.context, this.authorization.capabilitySnapshot, "canTrackDelivery");
    const tracking = await this.dependencies.loadTracking();
    return {
      enabled: tracking.enabled,
      stationaryMinutes: tracking.stationaryMinutes,
      routes: tracking.routes.map((route) => {
        const permissionGranted = route.permission === "granted";
        const available = tracking.enabled && permissionGranted && route.latest !== null && !route.noSignal;
        const unavailableReason = available
          ? null
          : !tracking.enabled
            ? "tracking_disabled" as const
            : !permissionGranted
              ? "permission_not_granted" as const
              : route.latest === null
                ? "no_location" as const
                : "no_signal" as const;
        return {
          ...route,
          latest: available ? route.latest : null,
          available,
          unavailableReason,
        };
      }),
    };
  }
}
