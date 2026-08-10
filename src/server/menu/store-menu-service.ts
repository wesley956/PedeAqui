import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import { assertNoScheduleOverlap } from "@/server/menu/schedule";
import { menuSettingsInputSchema, storeHourInputSchema, type MenuSettingsInput, type StoreHourInput } from "@/server/menu/schemas";

const uuidSchema = z.string().uuid();

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

const defaults = {
  theme: "pedeaqui",
  primary_color: "#FF6B00",
  logo_url: null,
  cover_url: null,
  show_search: true,
  show_categories: true,
  show_product_images: true,
  allow_pickup: true,
  allow_delivery: true,
  minimum_order_cents: 0,
  active: true,
  accepting_orders: true,
  pause_reason: null,
  paused_at: null,
} as const;

export class StoreMenuService {
  static async getSettings() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_menu_settings")
      .select("theme, primary_color, logo_url, cover_url, show_search, show_categories, show_product_images, allow_pickup, allow_delivery, minimum_order_cents, active, accepting_orders, pause_reason, paused_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    return data ?? defaults;
  }

  static async saveSettings(input: MenuSettingsInput) {
    const values = menuSettingsInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: before, error: readError } = await admin.from("store_menu_settings")
      .select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;

    const payload = {
      organization_id: context.organizationId,
      store_id: storeId,
      theme: "pedeaqui",
      primary_color: values.primaryColor.toUpperCase(),
      logo_url: values.logoUrl ?? null,
      cover_url: values.coverUrl ?? null,
      show_search: values.showSearch,
      show_categories: values.showCategories,
      show_product_images: values.showProductImages,
      allow_pickup: values.allowPickup,
      allow_delivery: values.allowDelivery,
      minimum_order_cents: values.minimumOrderCents,
      active: values.active,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin.from("store_menu_settings")
      .upsert(payload, { onConflict: "store_id" })
      .select("theme, primary_color, logo_url, cover_url, show_search, show_categories, show_product_images, allow_pickup, allow_delivery, minimum_order_cents, active, accepting_orders, pause_reason, paused_at")
      .single();
    if (error) throw error;

    await AuditService.record(context, { action: "menu.settings_updated", entityType: "store", entityId: storeId, before, after: data });
    await EventService.enqueue(context, { type: "menu.settings_updated", entityType: "store", entityId: storeId, payload: { active: data.active } });
    return data;
  }

  static async setAcceptingOrders(accepting: boolean, reason?: string | null) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: before, error: readError } = await admin.from("store_menu_settings")
      .select("accepting_orders, pause_reason, paused_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;

    const now = new Date().toISOString();
    const pauseReason: string | null = accepting ? null : (reason?.trim().slice(0, 240) || "Pausa operacional");
    const pausedAt: string | null = accepting ? null : now;
    const pausedBy: string | null = accepting ? null : context.userId;
    const patch = {
      organization_id: context.organizationId,
      store_id: storeId,
      accepting_orders: accepting,
      pause_reason: pauseReason,
      paused_at: pausedAt,
      paused_by: pausedBy,
      updated_at: now,
    };

    const { data, error } = await admin.from("store_menu_settings")
      .upsert(patch, { onConflict: "store_id" })
      .select("accepting_orders, pause_reason, paused_at")
      .single();
    if (error) throw error;

    const action = accepting ? "menu.orders_resumed" : "menu.orders_paused";
    await AuditService.record(context, { action, entityType: "store", entityId: storeId, before, after: data });
    await EventService.enqueue(context, { type: action, entityType: "store", entityId: storeId, payload: { reason: data.pause_reason } });
    return data;
  }

  static async listHours() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_hours")
      .select("id, weekday, opens_at, closes_at, closes_next_day, sort_order, active")
      .eq("organization_id", context.organizationId).eq("store_id", storeId)
      .order("weekday").order("sort_order").order("opens_at");
    if (error) throw error;
    return data ?? [];
  }

  static async addHour(input: StoreHourInput) {
    const values = storeHourInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: current, error: currentError } = await admin.from("store_hours")
      .select("weekday, opens_at, closes_at, closes_next_day")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true);
    if (currentError) throw currentError;

    assertNoScheduleOverlap([
      ...(current ?? []).map((row) => ({ weekday: row.weekday, opensAt: row.opens_at.slice(0, 5), closesAt: row.closes_at.slice(0, 5), closesNextDay: row.closes_next_day })),
      values,
    ]);

    const { data, error } = await admin.from("store_hours").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      weekday: values.weekday,
      opens_at: values.opensAt,
      closes_at: values.closesAt,
      closes_next_day: values.closesNextDay,
      sort_order: values.sortOrder,
      active: values.active,
    }).select("id, weekday, opens_at, closes_at, closes_next_day, sort_order, active").single();
    if (error) throw error;

    await AuditService.record(context, { action: "store.hours_added", entityType: "store_hour", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "store.hours_changed", entityType: "store", entityId: storeId, payload: { weekday: data.weekday } });
    return data;
  }

  static async removeHour(hourId: string) {
    const id = uuidSchema.parse(hourId);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("store_hours")
      .select("id, weekday, opens_at, closes_at, closes_next_day")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).single();
    if (readError) throw readError;
    const { error } = await admin.from("store_hours").delete()
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "store.hours_removed", entityType: "store_hour", entityId: id, before });
    await EventService.enqueue(context, { type: "store.hours_changed", entityType: "store", entityId: storeId, payload: { removed_hour_id: id } });
  }
}
