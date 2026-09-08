import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeExternalOrderPresentation } from "@/features/orders/external-order-presentation";
import { withExternalPrintIdentity } from "@/server/printing/external-print-presentation";

type Scope = {
  organizationId: string;
  storeId: string;
  orderId: string;
};

type FallbackResult =
  | { kind: "not_external" | "not_confirmed" | "existing" | "no_route" }
  | { kind: "queued" | "duplicate"; jobId: string };

/**
 * The database confirmation trigger remains the primary print policy. External
 * items intentionally have no local product_id, so production-station routing
 * can legitimately yield zero jobs. In that single case we route the complete
 * canonical snapshot to the first configured auto-print production route.
 *
 * This is deliberately provider-neutral and idempotent. It never reads prices
 * from the PedeAqui catalog and it never creates a second original print job.
 */
export class ExternalOrderPrintService {
  static async ensureConfirmedOrder(scope: Scope): Promise<FallbackResult> {
    const admin = createAdminClient();
    const [orderResult, externalResult, existingResult] = await Promise.all([
      admin.from("orders")
        .select("id, display_number, channel, fulfillment_type, order_status, customer_name_snapshot, customer_phone_snapshot, address_street_snapshot, address_number_snapshot, address_complement_snapshot, address_district_snapshot, address_city_snapshot, address_state_snapshot, address_reference_snapshot, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method_snapshot, cash_change_for_cents, created_at, confirmed_at, scheduled_for")
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("id", scope.orderId)
        .maybeSingle(),
      admin.from("external_orders")
        .select("provider, external_order_id, payment_owner, logistics_owner, sync_status, last_snapshot")
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("order_id", scope.orderId)
        .maybeSingle(),
      admin.from("print_jobs")
        .select("id")
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("order_id", scope.orderId)
        .eq("is_reprint", false)
        .limit(1)
        .maybeSingle(),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (externalResult.error) throw externalResult.error;
    if (existingResult.error) throw existingResult.error;
    if (!externalResult.data) return { kind: "not_external" };
    if (!orderResult.data || orderResult.data.order_status !== "confirmed") return { kind: "not_confirmed" };
    if (existingResult.data) return { kind: "existing" };

    const external = sanitizeExternalOrderPresentation({
      provider: String(externalResult.data.provider ?? ""),
      external_order_id: String(externalResult.data.external_order_id ?? ""),
      payment_owner: String(externalResult.data.payment_owner ?? ""),
      logistics_owner: typeof externalResult.data.logistics_owner === "string" ? externalResult.data.logistics_owner : null,
      sync_status: String(externalResult.data.sync_status ?? "attention"),
      last_snapshot: externalResult.data.last_snapshot,
    });
    if (!external) return { kind: "not_external" };

    const stationsResult = await admin.from("production_stations")
      .select("id, name, code, sort_order")
      .eq("organization_id", scope.organizationId)
      .eq("store_id", scope.storeId)
      .eq("kind", "production")
      .eq("active", true)
      .eq("auto_print", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (stationsResult.error) throw stationsResult.error;
    const stations = stationsResult.data ?? [];
    if (stations.length === 0) return { kind: "no_route" };

    const stationIds = stations.map((station) => station.id);
    const routesResult = await admin.from("station_printers")
      .select("station_id, printer_id, copies, priority")
      .eq("organization_id", scope.organizationId)
      .eq("store_id", scope.storeId)
      .eq("active", true)
      .in("station_id", stationIds);
    if (routesResult.error) throw routesResult.error;
    const routes = routesResult.data ?? [];
    if (routes.length === 0) return { kind: "no_route" };

    const printerIds = [...new Set(routes.map((route) => route.printer_id))];
    const printersResult = await admin.from("printers")
      .select("id, name, default_copies")
      .eq("organization_id", scope.organizationId)
      .eq("store_id", scope.storeId)
      .eq("active", true)
      .in("id", printerIds);
    if (printersResult.error) throw printersResult.error;
    const printers = printersResult.data ?? [];
    const printerById = new Map(printers.map((printer) => [printer.id, printer]));
    const stationById = new Map(stations.map((station) => [station.id, station]));
    const stationOrder = new Map(stations.map((station, index) => [station.id, index]));
    const usableRoutes = routes
      .filter((route) => printerById.has(route.printer_id) && stationById.has(route.station_id))
      .sort((a, b) => {
        const byStation = (stationOrder.get(a.station_id) ?? Number.MAX_SAFE_INTEGER) - (stationOrder.get(b.station_id) ?? Number.MAX_SAFE_INTEGER);
        if (byStation !== 0) return byStation;
        const byPriority = Number(a.priority ?? 100) - Number(b.priority ?? 100);
        if (byPriority !== 0) return byPriority;
        return String(printerById.get(a.printer_id)?.name ?? "").localeCompare(String(printerById.get(b.printer_id)?.name ?? ""));
      });
    const route = usableRoutes[0];
    if (!route) return { kind: "no_route" };
    const station = stationById.get(route.station_id)!;
    const printer = printerById.get(route.printer_id)!;

    const itemsResult = await admin.from("order_items")
      .select("id, product_id, product_name_snapshot, quantity, note, unit_total_price_cents, line_total_cents, created_at")
      .eq("organization_id", scope.organizationId)
      .eq("store_id", scope.storeId)
      .eq("order_id", scope.orderId)
      .order("created_at", { ascending: true });
    if (itemsResult.error) throw itemsResult.error;
    const items = itemsResult.data ?? [];
    if (items.length === 0) return { kind: "no_route" };

    const itemIds = items.map((item) => item.id);
    const modifiersResult = await admin.from("order_item_modifiers")
      .select("order_item_id, group_name_snapshot, modifier_name_snapshot, unit_price_cents, quantity, created_at")
      .eq("organization_id", scope.organizationId)
      .eq("store_id", scope.storeId)
      .in("order_item_id", itemIds)
      .order("created_at", { ascending: true });
    if (modifiersResult.error) throw modifiersResult.error;
    const modifiersByItem = new Map<string, Array<Record<string, unknown>>>();
    for (const modifier of modifiersResult.data ?? []) {
      const list = modifiersByItem.get(modifier.order_item_id) ?? [];
      list.push({
        group: modifier.group_name_snapshot,
        name: modifier.modifier_name_snapshot,
        unit_price_cents: Number(modifier.unit_price_cents),
        quantity: Number(modifier.quantity),
      });
      modifiersByItem.set(modifier.order_item_id, list);
    }

    const storeResult = await admin.from("stores")
      .select("timezone")
      .eq("organization_id", scope.organizationId)
      .eq("id", scope.storeId)
      .maybeSingle();
    if (storeResult.error) throw storeResult.error;
    const order = orderResult.data;
    const payload = withExternalPrintIdentity({
      order: {
        id: order.id,
        display_number: Number(order.display_number),
        channel: order.channel,
        fulfillment_type: order.fulfillment_type,
        customer_name: order.customer_name_snapshot,
        customer_phone: order.customer_phone_snapshot,
        address: {
          street: order.address_street_snapshot,
          number: order.address_number_snapshot,
          complement: order.address_complement_snapshot,
          district: order.address_district_snapshot,
          city: order.address_city_snapshot,
          state: order.address_state_snapshot,
          reference: order.address_reference_snapshot,
        },
        subtotal_cents: Number(order.subtotal_cents),
        discount_cents: Number(order.discount_cents),
        delivery_fee_cents: Number(order.delivery_fee_cents),
        total_cents: Number(order.total_cents),
        payment_method: order.payment_method_snapshot,
        cash_change_for_cents: order.cash_change_for_cents === null ? null : Number(order.cash_change_for_cents),
        created_at: order.created_at,
        confirmed_at: order.confirmed_at,
        scheduled_for: order.scheduled_for,
        timezone: storeResult.data?.timezone ?? "America/Sao_Paulo",
      },
      station: { id: station.id, name: station.name, code: station.code, kind: "production" },
      items: items.map((item) => ({
        order_item_id: item.id,
        product_id: item.product_id,
        category_id: null,
        category_name: null,
        name: item.product_name_snapshot,
        quantity: Number(item.quantity),
        note: item.note,
        unit_total_cents: Number(item.unit_total_price_cents),
        line_total_cents: Number(item.line_total_cents),
        modifiers: modifiersByItem.get(item.id) ?? [],
      })),
    }, external);

    const idempotencyKey = `order:${scope.orderId}:confirmed:external-fallback:${station.id}:${printer.id}:kitchen`;
    const priority = Math.min(10_000, Math.max(0, Number(route.priority ?? 100)));
    const copies = Math.min(10, Math.max(1, Number(route.copies ?? printer.default_copies ?? 1)));
    const insertResult = await admin.from("print_jobs").insert({
      organization_id: scope.organizationId,
      store_id: scope.storeId,
      order_id: scope.orderId,
      station_id: station.id,
      printer_id: printer.id,
      document_type: "kitchen",
      template_key: "order_kitchen",
      template_version: 1,
      payload,
      priority,
      copies,
      idempotency_key: idempotencyKey,
      source: "integration",
    }).select("id").single();
    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        const replay = await admin.from("print_jobs")
          .select("id")
          .eq("organization_id", scope.organizationId)
          .eq("store_id", scope.storeId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (replay.error) throw replay.error;
        if (replay.data?.id) return { kind: "duplicate", jobId: replay.data.id };
      }
      throw insertResult.error;
    }

    const eventResult = await admin.from("domain_events").insert({
      organization_id: scope.organizationId,
      store_id: scope.storeId,
      event_type: "print.external_fallback_enqueued",
      entity_type: "order",
      entity_id: scope.orderId,
      payload: {
        provider: external.provider,
        station_id: station.id,
        printer_id: printer.id,
        reason: "external_items_without_local_station_mapping",
      },
      status: "pending",
      attempts: 0,
      occurred_at: new Date().toISOString(),
    });
    if (eventResult.error) throw eventResult.error;

    return { kind: "queued", jobId: insertResult.data.id };
  }
}
