import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { hashCartToken } from "@/server/cart/cart-token";
import { CheckoutError, CheckoutService } from "@/server/checkout/checkout-service";
import { deriveOrderAccessToken, hashOrderAccessToken } from "@/server/orders/order-token";
import {
  assertTransition,
  fulfillmentIsComplete,
  paymentAllowsOrderCompletion,
  type FulfillmentStatus,
  type OrderStateDomain,
  type OrderStatus,
  type PaymentStatus,
  type ProductionStatus,
  type StateByDomain,
} from "@/server/orders/state-machines";

const uuidSchema = z.string().uuid();
const createResultSchema = z.object({ order_id: z.string().uuid(), display_number: z.coerce.number(), created: z.boolean() });
const transitionResultSchema = z.object({
  order_id: z.string().uuid(),
  domain: z.enum(["order", "payment", "production", "fulfillment"]),
  from: z.string(),
  to: z.string(),
  changed: z.boolean(),
});

type OrderModifierRow = {
  order_item_id: string;
  group_name_snapshot: string;
  modifier_name_snapshot: string;
  unit_price_cents: number;
};

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export function groupOrderModifiers(rows: OrderModifierRow[]) {
  const grouped = new Map<string, OrderModifierRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.order_item_id) ?? [];
    current.push(row);
    grouped.set(row.order_item_id, current);
  }
  return grouped;
}

export class OrderService {
  private static async findExistingByCartToken(storeSlug: string, token: string) {
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id, organization_id")
      .ilike("slug", storeSlug)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) return null;

    const { data: cart, error: cartError } = await admin.from("carts")
      .select("id")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("token_hash", hashCartToken(token))
      .maybeSingle();
    if (cartError) throw cartError;
    if (!cart) return null;

    const { data: order, error: orderError } = await admin.from("orders")
      .select("id, display_number")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("source_cart_id", cart.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return null;
    return { order_id: order.id, display_number: Number(order.display_number), created: false };
  }

  static async createFromCheckout(storeSlug: string, token: string) {
    const accessToken = deriveOrderAccessToken(token);
    const existing = await this.findExistingByCartToken(storeSlug, token);
    if (existing) return { ...existing, accessToken };

    const reviewed = await CheckoutService.review(storeSlug, token);
    if (!reviewed.review.ready) {
      throw new CheckoutError("checkout_not_ready", reviewed.review.blockers.map((item) => item.message).join(" "));
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_order_from_checkout_internal", {
      p_store_id: reviewed.store.id,
      p_token_hash: hashCartToken(token),
      p_order_access_token_hash: hashOrderAccessToken(accessToken),
    });
    if (error) throw error;
    return { ...createResultSchema.parse(data), accessToken };
  }

  static async list(limit = 150) {
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("orders")
      .select("id, display_number, channel, fulfillment_type, order_status, payment_status, production_status, fulfillment_status, customer_name_snapshot, total_cents, scheduled_for, created_at, updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 250));
    if (error) throw error;
    return { context, orders: data ?? [] };
  }

  static async get(orderId: string) {
    const id = uuidSchema.parse(orderId);
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: order, error } = await admin.from("orders")
      .select("*")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Order not found");

    const { data: items, error: itemsError } = await admin.from("order_items")
      .select("id, product_name_snapshot, product_image_url_snapshot, quantity, note, unit_base_price_cents, unit_modifiers_price_cents, unit_total_price_cents, line_total_cents")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("order_id", id)
      .order("created_at");
    if (itemsError) throw itemsError;

    const itemIds = (items ?? []).map((item) => item.id);
    const modifiersResult = itemIds.length > 0
      ? await admin.from("order_item_modifiers")
        .select("order_item_id, group_name_snapshot, modifier_name_snapshot, unit_price_cents")
        .eq("organization_id", context.organizationId).eq("store_id", storeId)
        .in("order_item_id", itemIds).order("created_at")
      : { data: [], error: null };
    if (modifiersResult.error) throw modifiersResult.error;
    const modifiersByItem = groupOrderModifiers((modifiersResult.data ?? []) as OrderModifierRow[]);

    const { data: history, error: historyError } = await admin.from("order_state_history")
      .select("id, state_domain, from_state, to_state, reason, source, actor_user_id, created_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("order_id", id)
      .order("created_at");
    if (historyError) throw historyError;

    const { data: printJobs, error: printError } = await admin.from("print_jobs")
      .select("id, document_type, status, printer_id, station_id, attempts, max_attempts, copies, is_reprint, reprint_reason, created_at, printed_at, last_error")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("order_id", id)
      .order("created_at", { ascending: false });
    if (printError) throw printError;

    const printerIds = [...new Set((printJobs ?? []).map((job) => job.printer_id))];
    const stationIds = [...new Set((printJobs ?? []).map((job) => job.station_id).filter((value): value is string => Boolean(value)))];
    const [printersResult, stationsResult] = await Promise.all([
      printerIds.length
        ? admin.from("printers").select("id, name").eq("organization_id", context.organizationId).eq("store_id", storeId).in("id", printerIds)
        : Promise.resolve({ data: [], error: null }),
      stationIds.length
        ? admin.from("production_stations").select("id, name").eq("organization_id", context.organizationId).eq("store_id", storeId).in("id", stationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (printersResult.error) throw printersResult.error;
    if (stationsResult.error) throw stationsResult.error;
    const printerNames = new Map((printersResult.data ?? []).map((printer) => [printer.id, printer.name]));
    const stationNames = new Map((stationsResult.data ?? []).map((station) => [station.id, station.name]));

    return {
      context,
      order,
      items: (items ?? []).map((item) => ({
        ...item,
        modifiers: modifiersByItem.get(item.id) ?? [],
      })),
      history: history ?? [],
      printJobs: (printJobs ?? []).map((job) => ({
        ...job,
        printer_name: printerNames.get(job.printer_id) ?? "Impressora",
        station_name: job.station_id ? stationNames.get(job.station_id) ?? "Estação" : "Sem estação",
      })),
    };
  }

  static async transition<K extends OrderStateDomain>(
    orderId: string,
    domain: K,
    to: StateByDomain[K],
    reason?: string | null,
  ) {
    const id = uuidSchema.parse(orderId);
    const permission = domain === "order" && (to === "canceled" || to === "rejected")
      ? PERMISSIONS.ORDERS_CANCEL
      : PERMISSIONS.ORDERS_EDIT;
    const context = await authorize(permission);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: order, error: readError } = await admin.from("orders")
      .select("id, order_status, payment_status, production_status, fulfillment_status")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;
    if (!order) throw new Error("Order not found");

    const currentByDomain: Record<OrderStateDomain, string> = {
      order: order.order_status,
      payment: order.payment_status,
      production: order.production_status,
      fulfillment: order.fulfillment_status,
    };
    assertTransition(domain, currentByDomain[domain] as StateByDomain[K], to);

    if (domain === "order" && to === "completed") {
      if (!fulfillmentIsComplete(order.fulfillment_status as FulfillmentStatus)) {
        throw new Error("Fulfillment must be complete before the order can be completed");
      }
      if (!paymentAllowsOrderCompletion(order.payment_status as PaymentStatus)) {
        throw new Error("Payment must be settled before the order can be completed");
      }
    }
    if (domain === "order" && (to === "canceled" || to === "rejected")) {
      if (!reason || reason.trim().length < 3) throw new Error("Reason is required");
      if (fulfillmentIsComplete(order.fulfillment_status as FulfillmentStatus)) throw new Error("Fulfilled order cannot be canceled or rejected");
    }
    if (domain === "production" && to === "queued" && order.order_status !== "confirmed") {
      throw new Error("Order must be confirmed before entering production");
    }
    if (domain === "fulfillment") {
      const status = to as FulfillmentStatus;
      if (["awaiting_assignment", "awaiting_pickup", "served"].includes(status) && order.order_status !== "confirmed") {
        throw new Error("Order must be confirmed before fulfillment starts");
      }
      if (["awaiting_pickup", "picked_up", "out_for_delivery", "served"].includes(status)
        && order.production_status !== "ready" && order.production_status !== "not_required") {
        throw new Error("Production must be ready before this fulfillment transition");
      }
    }

    const { data, error } = await admin.rpc("order_transition_internal", {
      p_order_id: id,
      p_domain: domain,
      p_to_state: to,
      p_reason: reason?.trim() || null,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (error) throw error;
    return transitionResultSchema.parse(data);
  }

  static confirm(orderId: string) {
    return this.transition(orderId, "order", "confirmed" as OrderStatus);
  }

  static reject(orderId: string, reason: string) {
    return this.transition(orderId, "order", "rejected" as OrderStatus, reason);
  }

  static cancel(orderId: string, reason: string) {
    return this.transition(orderId, "order", "canceled" as OrderStatus, reason);
  }

  static complete(orderId: string) {
    return this.transition(orderId, "order", "completed" as OrderStatus);
  }

  static async startProduction(orderId: string) {
    const id = uuidSchema.parse(orderId);
    const context = await authorize(PERMISSIONS.ORDERS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: scoped, error: readError } = await admin.from("orders")
      .select("id, order_status, production_status")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;
    if (!scoped) throw new Error("Order not found");
    if (scoped.order_status !== "confirmed") throw new Error("Order must be confirmed before production starts");

    const { data, error } = await admin.rpc("order_start_production_internal", {
      p_order_id: id,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (error) throw error;
    return transitionResultSchema.parse(data);
  }

  static setPayment(orderId: string, status: PaymentStatus, reason?: string | null) {
    return this.transition(orderId, "payment", status, reason);
  }

  static setProduction(orderId: string, status: ProductionStatus, reason?: string | null) {
    return this.transition(orderId, "production", status, reason);
  }

  static setFulfillment(orderId: string, status: FulfillmentStatus, reason?: string | null) {
    return this.transition(orderId, "fulfillment", status, reason);
  }
}
