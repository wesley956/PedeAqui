import type { OrderManagerRow } from "@/features/orders/manager-model";
import type { ExternalOrderPresentation } from "@/features/orders/external-order-presentation";
import {
  rawWorkflowStage,
  visibleWorkflowStage,
  visibleWorkflowStages,
  type OrderStateSnapshot,
} from "@/server/conversations/order-workflow-visibility";
import { KitchenService } from "@/server/kitchen/kitchen-service";
import {
  AuthorityResolver,
  type AuthoritySnapshot,
} from "@/server/intelligence/authority";
import type { IntelligenceContext } from "@/server/intelligence/context";
import { allowedDisclosure } from "@/server/intelligence/disclosure-policy";
import { OrderPresentationService } from "@/server/orders/order-presentation-service";
import { PublicOrderService, type PublicOrderTrackingProjection } from "@/server/orders/public-order-service";
import { OrderService } from "@/server/orders/order-service";
import {
  orderStatusLabels,
  productionStatusLabels,
  type OrderStatus,
  type ProductionStatus,
} from "@/server/orders/state-machines";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";

export const INTELLIGENCE_ORDER_WORKFLOW_FLAG = "intelligence_canonical_order_workflow";
export const INTELLIGENCE_ORDER_WORKFLOW_MODE = "shadow" as const;

export type OrderWorkflowAdapterAuthorization = {
  permissions?: ReadonlySet<string>;
  authoritySnapshot?: AuthoritySnapshot | null;
};

export type PublicTrackingAccess = {
  storeSlug: string;
  accessToken: string;
};

export type CanonicalOrderStatusProjection = {
  audience: IntelligenceContext["audience"];
  displayNumber: number;
  fulfillmentType: string;
  orderStatus: string;
  orderStatusLabel: string;
  paymentStatus: string;
  productionStatus: string;
  productionStatusLabel: string;
  fulfillmentStatus: string;
  visibleStage: string;
  external: ExternalOrderPresentation | null;
  authority: {
    orderAuthority: "pedeaqui" | "provider";
    provider: "ifood" | "99food" | null;
    confirmationState: "confirmed" | "pending" | "attention";
  } | null;
};

export type CanonicalOrderSummaryProjection = CanonicalOrderStatusProjection & {
  channel: string;
  totalCents: number;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
};

export type CanonicalOrderTrackingProjection = {
  audience: "customer";
  displayNumber: number;
  fulfillmentType: string;
  orderStatus: string;
  orderStatusLabel: string;
  paymentStatus: string;
  productionStatus: string;
  productionStatusLabel: string;
  fulfillmentStatus: string;
  totalCents: number;
  scheduledFor: string | null;
  deliveryEstimateMinutes: { min: number | null; max: number | null };
  confirmedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalOrderWorkflowProjection = {
  audience: "agent" | "merchant" | "system";
  displayNumber: number;
  fulfillmentType: string;
  mode: "standard" | "simplified" | "custom";
  rawStage: string;
  visibleStage: string;
  visibleStages: readonly string[];
  quickFinish: boolean;
};

export type CanonicalProductionStatusProjection = {
  audience: IntelligenceContext["audience"];
  displayNumber: number;
  productionStatus: string;
  productionStatusLabel: string;
  inKitchen: boolean;
  externalProvider: "ifood" | "99food" | null;
};

export type OrderWorkflowAdapterDependencies = {
  getOrder: typeof OrderService.get;
  getManagerRow: typeof OrderPresentationService.getManagerRow;
  getWorkflowSettings: typeof OrderWorkflowSettingsService.get;
  getKitchenProjection: typeof KitchenService.projection;
  getPublicTracking: typeof PublicOrderService.getTracking;
};

const defaultDependencies: OrderWorkflowAdapterDependencies = {
  getOrder: OrderService.get.bind(OrderService),
  getManagerRow: OrderPresentationService.getManagerRow.bind(OrderPresentationService),
  getWorkflowSettings: OrderWorkflowSettingsService.get.bind(OrderWorkflowSettingsService),
  getKitchenProjection: KitchenService.projection.bind(KitchenService),
  getPublicTracking: PublicOrderService.getTracking.bind(PublicOrderService),
};

export class OrderWorkflowScopeError extends Error {
  constructor(message = "Order projection is outside the Intelligence context scope") {
    super(message);
    this.name = "OrderWorkflowScopeError";
  }
}

export class OrderAudienceError extends Error {
  constructor(message = "Audience is not authorized for this order projection") {
    super(message);
    this.name = "OrderAudienceError";
  }
}

export class OrderProjectionMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderProjectionMismatchError";
  }
}

export class OrderWorkflowAdapter {
  constructor(
    private readonly context: IntelligenceContext,
    private readonly authorization: OrderWorkflowAdapterAuthorization = {},
    private readonly dependencies: OrderWorkflowAdapterDependencies = defaultDependencies,
  ) {}

  async status(orderId: string, publicAccess?: PublicTrackingAccess): Promise<CanonicalOrderStatusProjection> {
    if (this.context.audience === "customer") {
      const tracking = await this.requirePublicTracking(orderId, publicAccess);
      const state = this.publicState(tracking);
      return {
        audience: "customer",
        displayNumber: tracking.order.display_number,
        fulfillmentType: tracking.order.fulfillment_type,
        orderStatus: tracking.order.order_status,
        orderStatusLabel: orderLabel(tracking.order.order_status),
        paymentStatus: tracking.order.payment_status,
        productionStatus: tracking.order.production_status,
        productionStatusLabel: productionLabel(tracking.order.production_status),
        fulfillmentStatus: tracking.order.fulfillment_status,
        visibleStage: rawWorkflowStage(state),
        external: null,
        authority: null,
      };
    }

    const projection = await this.requireOperationalProjection(orderId);
    const settings = await this.requireWorkflowSettings();
    const state = managerState(projection.manager);
    return {
      audience: this.context.audience,
      displayNumber: projection.manager.display_number,
      fulfillmentType: projection.manager.fulfillment_type,
      orderStatus: projection.manager.order_status,
      orderStatusLabel: orderLabel(projection.manager.order_status),
      paymentStatus: projection.manager.payment_status,
      productionStatus: projection.manager.production_status,
      productionStatusLabel: productionLabel(projection.manager.production_status),
      fulfillmentStatus: projection.manager.fulfillment_status,
      visibleStage: visibleWorkflowStage(state, persistedSettings(settings.settings)),
      external: projection.manager.external ?? null,
      authority: authorityProjection(projection.authority),
    };
  }

  async summary(orderId: string, publicAccess?: PublicTrackingAccess): Promise<CanonicalOrderSummaryProjection> {
    if (this.context.audience === "customer") {
      const tracking = await this.requirePublicTracking(orderId, publicAccess);
      const status = await this.status(orderId, publicAccess);
      return {
        ...status,
        channel: tracking.order.channel,
        totalCents: tracking.order.total_cents,
        scheduledFor: tracking.order.scheduled_for,
        createdAt: tracking.order.created_at,
        updatedAt: tracking.order.updated_at,
        customerName: null,
      };
    }

    const projection = await this.requireOperationalProjection(orderId);
    const settings = await this.requireWorkflowSettings();
    const manager = projection.manager;
    const state = managerState(manager);
    const maySeeName = allowedDisclosure(this.context, "display_name", {
      permissions: this.authorization.permissions,
    });
    return {
      audience: this.context.audience,
      displayNumber: manager.display_number,
      fulfillmentType: manager.fulfillment_type,
      orderStatus: manager.order_status,
      orderStatusLabel: orderLabel(manager.order_status),
      paymentStatus: manager.payment_status,
      productionStatus: manager.production_status,
      productionStatusLabel: productionLabel(manager.production_status),
      fulfillmentStatus: manager.fulfillment_status,
      visibleStage: visibleWorkflowStage(state, persistedSettings(settings.settings)),
      external: manager.external ?? null,
      authority: authorityProjection(projection.authority),
      channel: manager.channel,
      totalCents: Number(manager.total_cents),
      scheduledFor: manager.scheduled_for ?? null,
      createdAt: manager.created_at,
      updatedAt: manager.updated_at,
      customerName: maySeeName ? manager.customer_name_snapshot : null,
    };
  }

  async tracking(orderId: string, publicAccess: PublicTrackingAccess): Promise<CanonicalOrderTrackingProjection> {
    if (this.context.audience !== "customer") {
      throw new OrderAudienceError("order.tracking is reserved for the token-protected customer projection");
    }
    const tracking = await this.requirePublicTracking(orderId, publicAccess);
    return {
      audience: "customer",
      displayNumber: tracking.order.display_number,
      fulfillmentType: tracking.order.fulfillment_type,
      orderStatus: tracking.order.order_status,
      orderStatusLabel: orderLabel(tracking.order.order_status),
      paymentStatus: tracking.order.payment_status,
      productionStatus: tracking.order.production_status,
      productionStatusLabel: productionLabel(tracking.order.production_status),
      fulfillmentStatus: tracking.order.fulfillment_status,
      totalCents: tracking.order.total_cents,
      scheduledFor: tracking.order.scheduled_for,
      deliveryEstimateMinutes: {
        min: tracking.order.delivery_estimated_min_minutes,
        max: tracking.order.delivery_estimated_max_minutes,
      },
      confirmedAt: tracking.order.confirmed_at,
      completedAt: tracking.order.completed_at,
      canceledAt: tracking.order.canceled_at,
      createdAt: tracking.order.created_at,
      updatedAt: tracking.order.updated_at,
    };
  }

  async workflow(orderId: string): Promise<CanonicalOrderWorkflowProjection> {
    if (this.context.audience === "customer") {
      throw new OrderAudienceError("order.workflow exposes operational workflow only to authorized operational audiences");
    }
    const projection = await this.requireOperationalProjection(orderId);
    const settings = await this.requireWorkflowSettings();
    const state = managerState(projection.manager);
    const persisted = persistedSettings(settings.settings);
    const rawStage = rawWorkflowStage(state);
    const visibleStage = visibleWorkflowStage(state, persisted);
    const stages = visibleWorkflowStages({
      mode: settings.settings.mode,
      custom: settings.settings.custom,
      fulfillmentType: projection.manager.fulfillment_type,
    });
    return {
      audience: this.context.audience,
      displayNumber: projection.manager.display_number,
      fulfillmentType: projection.manager.fulfillment_type,
      mode: settings.settings.mode,
      rawStage,
      visibleStage,
      visibleStages: stages,
      quickFinish: settings.settings.mode === "custom" && settings.settings.custom.quickFinish,
    };
  }

  async productionStatus(orderId: string, publicAccess?: PublicTrackingAccess): Promise<CanonicalProductionStatusProjection> {
    if (this.context.audience === "customer") {
      const tracking = await this.requirePublicTracking(orderId, publicAccess);
      return {
        audience: "customer",
        displayNumber: tracking.order.display_number,
        productionStatus: tracking.order.production_status,
        productionStatusLabel: productionLabel(tracking.order.production_status),
        inKitchen: ["pending_confirmation", "queued", "preparing", "ready"].includes(tracking.order.production_status)
          && tracking.order.order_status === "confirmed",
        externalProvider: null,
      };
    }

    const projection = await this.requireOperationalProjection(orderId);
    const kitchen = await this.dependencies.getKitchenProjection(orderId);
    if (kitchen && kitchen.id !== orderId) {
      throw new OrderProjectionMismatchError("Kitchen projection returned a different order");
    }
    if (kitchen && kitchen.productionStatus !== projection.manager.production_status) {
      throw new OrderProjectionMismatchError(
        `Production status mismatch: order=${projection.manager.production_status} kitchen=${kitchen.productionStatus}`,
      );
    }
    return {
      audience: this.context.audience,
      displayNumber: projection.manager.display_number,
      productionStatus: projection.manager.production_status,
      productionStatusLabel: productionLabel(projection.manager.production_status),
      inKitchen: Boolean(kitchen),
      externalProvider: projection.manager.external?.provider ?? null,
    };
  }

  private async requireOperationalProjection(orderId: string) {
    this.assertOperationalAudience();
    const [detail, manager] = await Promise.all([
      this.dependencies.getOrder(orderId),
      this.dependencies.getManagerRow(orderId),
    ]);
    if (!manager) throw new Error("Order not found");
    this.assertAuthorizedContext(detail.context.organizationId, detail.context.storeId, orderId);
    if (detail.order.id !== orderId || manager.id !== orderId) {
      throw new OrderWorkflowScopeError("Canonical order readers returned a different order");
    }
    if (manager.order_status !== detail.order.order_status
      || manager.payment_status !== detail.order.payment_status
      || manager.production_status !== detail.order.production_status
      || manager.fulfillment_status !== detail.order.fulfillment_status) {
      throw new OrderProjectionMismatchError("OrderService and OrderPresentationService status projections diverged");
    }

    const external = manager.external ?? null;
    let authority: AuthoritySnapshot;
    if (external) {
      const supplied = this.authorization.authoritySnapshot;
      if (!supplied) throw new OrderAudienceError("External order requires a resolved authority snapshot");
      if (supplied.organizationId !== this.context.organizationId
        || supplied.storeId !== this.context.storeId
        || supplied.orderId !== orderId
        || supplied.provider !== external.provider
        || !supplied.decisions.view_order.allowed) {
        throw new OrderWorkflowScopeError("External order authority does not match the Intelligence context");
      }
      authority = supplied;
    } else {
      authority = AuthorityResolver.resolve(this.context, {
        kind: "internal",
        organizationId: this.context.organizationId,
        storeId: this.context.storeId,
        orderId,
      });
      if (!authority.decisions.view_order.allowed) {
        throw new OrderWorkflowScopeError("Order authority denied the read projection");
      }
    }
    return { detail, manager, authority };
  }

  private async requireWorkflowSettings() {
    const result = await this.dependencies.getWorkflowSettings();
    this.assertAuthorizedContext(result.context.organizationId, result.context.storeId, this.context.activeReferences.orderId);
    return result;
  }

  private async requirePublicTracking(orderId: string, access?: PublicTrackingAccess) {
    if (!access?.storeSlug.trim() || !access.accessToken.trim()) {
      throw new OrderAudienceError("Public order tracking requires the existing store slug and access token contract");
    }
    const tracking = await this.dependencies.getPublicTracking(access.storeSlug, orderId, access.accessToken);
    if (!tracking) throw new Error("Order not found");
    if (tracking.order.id !== orderId) {
      throw new OrderWorkflowScopeError("Public tracking returned a different order");
    }
    this.assertAuthorizedContext(tracking.store.organization_id, tracking.store.id, orderId);
    return tracking;
  }

  private assertOperationalAudience() {
    if (this.context.audience === "customer") {
      throw new OrderAudienceError("Customer audience must use the token-protected public projection");
    }
    if (!allowedDisclosure(this.context, "order_history", { permissions: this.authorization.permissions })) {
      throw new OrderAudienceError("Operational order projection requires orders.view and privileged RBAC context");
    }
  }

  private assertAuthorizedContext(organizationId: string, storeId: string | null, orderId?: string | null) {
    if (!storeId
      || organizationId !== this.context.organizationId
      || storeId !== this.context.storeId
      || (this.context.activeReferences.orderId && orderId && this.context.activeReferences.orderId !== orderId)) {
      throw new OrderWorkflowScopeError();
    }
  }

  private publicState(tracking: PublicOrderTrackingProjection): OrderStateSnapshot {
    return {
      fulfillmentType: tracking.order.fulfillment_type,
      orderStatus: tracking.order.order_status,
      productionStatus: tracking.order.production_status,
      fulfillmentStatus: tracking.order.fulfillment_status,
    };
  }
}

function managerState(manager: OrderManagerRow): OrderStateSnapshot {
  return {
    fulfillmentType: manager.fulfillment_type,
    orderStatus: manager.order_status,
    productionStatus: manager.production_status,
    fulfillmentStatus: manager.fulfillment_status,
  };
}

function persistedSettings(settings: Awaited<ReturnType<typeof OrderWorkflowSettingsService.get>>["settings"]) {
  return {
    orders_workflow_mode: settings.mode,
    orders_custom_workflow: settings.custom,
  };
}

function authorityProjection(snapshot: AuthoritySnapshot) {
  return {
    orderAuthority: snapshot.orderAuthority,
    provider: snapshot.provider,
    confirmationState: snapshot.confirmationState,
  };
}

function orderLabel(status: string) {
  return orderStatusLabels[status as OrderStatus] ?? status;
}

function productionLabel(status: string) {
  return productionStatusLabels[status as ProductionStatus] ?? status;
}