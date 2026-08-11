import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import { loadDiningCatalog } from "@/server/dining/catalog";
import {
  diningMemberInputSchema,
  diningPaymentInputSchema,
  diningRoundInputSchema,
  diningTableInputSchema,
  type DiningMemberInput,
  type DiningPaymentInput,
  type DiningRoundInput,
  type DiningTableInput,
} from "@/server/dining/schemas";

const uuidSchema = z.string().uuid();
const idemSchema = z.string().trim().min(8).max(180);
const tableStatusSchema = z.enum(["available", "reserved", "cleaning", "disabled"]);

type DiningOrderItemRow = {
  id: string;
  order_id: string;
  product_name_snapshot: string;
  quantity: number;
  note: string | null;
  unit_total_price_cents: number;
  line_total_cents: number;
};

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária para operar o salão");
  return storeId;
}

async function requireScopedTable(permission: typeof PERMISSIONS.DINING_VIEW | typeof PERMISSIONS.DINING_MANAGE | typeof PERMISSIONS.DINING_ORDER | typeof PERMISSIONS.DINING_SETTLE, tableId: string) {
  const context = await authorize(permission);
  const storeId = requireStoreId(context.storeId);
  const admin = createAdminClient();
  const { data, error } = await admin.from("tables").select("*")
    .eq("id", uuidSchema.parse(tableId)).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mesa não encontrada");
  return { context, storeId, table: data, admin };
}

async function requireScopedTab(permission: typeof PERMISSIONS.DINING_VIEW | typeof PERMISSIONS.DINING_MANAGE | typeof PERMISSIONS.DINING_ORDER | typeof PERMISSIONS.DINING_SETTLE, tabId: string) {
  const context = await authorize(permission);
  const storeId = requireStoreId(context.storeId);
  const admin = createAdminClient();
  const { data, error } = await admin.from("tabs").select("*")
    .eq("id", uuidSchema.parse(tabId)).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Comanda não encontrada");
  return { context, storeId, tab: data, admin };
}

function paymentMemberId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).tab_member_id;
  return typeof value === "string" ? value : null;
}

export class DiningService {
  static async listTables() {
    const context = await authorize(PERMISSIONS.DINING_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: tables, error } = await admin.from("tables")
      .select("id, code, name, capacity, status, area, sort_order, qr_enabled, public_code, opened_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId)
      .order("sort_order").order("code");
    if (error) throw error;

    const tableIds = (tables ?? []).map((table) => table.id);
    const { data: tabs, error: tabsError } = tableIds.length
      ? await admin.from("tabs").select("id, table_id, display_number, status, guest_count, opened_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId)
        .in("table_id", tableIds).in("status", ["open", "settling"])
      : { data: [], error: null };
    if (tabsError) throw tabsError;
    const tabIds = (tabs ?? []).map((tab) => tab.id);
    const { data: orders, error: orderError } = tabIds.length
      ? await admin.from("orders").select("id, tab_id, total_cents, order_status")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("tab_id", tabIds)
      : { data: [], error: null };
    if (orderError) throw orderError;
    const orderIds = (orders ?? []).filter((order) => !["canceled", "rejected"].includes(order.order_status)).map((order) => order.id);
    const { data: payments, error: paymentError } = orderIds.length
      ? await admin.from("payments").select("order_id, amount_cents")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("status", "paid").in("order_id", orderIds)
      : { data: [], error: null };
    if (paymentError) throw paymentError;

    const tabByTable = new Map((tabs ?? []).map((tab) => [tab.table_id, tab]));
    const paidByOrder = new Map<string, number>();
    for (const payment of payments ?? []) paidByOrder.set(payment.order_id, (paidByOrder.get(payment.order_id) ?? 0) + Number(payment.amount_cents));
    const accountByTab = new Map<string, { total: number; paid: number }>();
    for (const order of orders ?? []) {
      if (["canceled", "rejected"].includes(order.order_status)) continue;
      const current = accountByTab.get(order.tab_id) ?? { total: 0, paid: 0 };
      current.total += Number(order.total_cents);
      current.paid += paidByOrder.get(order.id) ?? 0;
      accountByTab.set(order.tab_id, current);
    }
    return {
      context,
      tables: (tables ?? []).map((table) => {
        const tab = tabByTable.get(table.id) ?? null;
        const account = tab ? accountByTab.get(tab.id) ?? { total: 0, paid: 0 } : { total: 0, paid: 0 };
        return { ...table, tab, total_cents: account.total, paid_cents: account.paid, due_cents: Math.max(0, account.total - account.paid) };
      }),
    };
  }

  static async detail(tableId: string) {
    const { context, storeId, table, admin } = await requireScopedTable(PERMISSIONS.DINING_VIEW, tableId);
    const { data: tab, error: tabError } = await admin.from("tabs").select("*")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("table_id", table.id)
      .in("status", ["open", "settling"]).order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (tabError) throw tabError;
    const catalog = await loadDiningCatalog(context.organizationId, storeId);
    const { data: targets, error: targetError } = await admin.from("tables")
      .select("id, code, name, status").eq("organization_id", context.organizationId).eq("store_id", storeId)
      .neq("id", table.id).in("status", ["available", "reserved"]).order("sort_order").order("code");
    if (targetError) throw targetError;
    if (!tab) return { context, table, tab: null, members: [], orders: [], allocations: [], account: { totalCents: 0, paidCents: 0, dueCents: 0 }, memberAccounts: [], targets: targets ?? [], ...catalog };

    const [membersResult, ordersResult] = await Promise.all([
      admin.from("tab_members").select("id, name, customer_id, seat_number, created_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("tab_id", tab.id).order("created_at"),
      admin.from("orders").select("id, display_number, channel, order_status, payment_status, production_status, fulfillment_status, total_cents, created_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("tab_id", tab.id).order("created_at"),
    ]);
    if (membersResult.error) throw membersResult.error;
    if (ordersResult.error) throw ordersResult.error;
    const orders = ordersResult.data ?? [];
    const orderIds = orders.map((order) => order.id);
    const { data: items, error: itemsError } = orderIds.length
      ? await admin.from("order_items").select("id, order_id, product_name_snapshot, quantity, note, unit_total_price_cents, line_total_cents")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("order_id", orderIds).order("created_at")
      : { data: [], error: null };
    if (itemsError) throw itemsError;
    const itemRows = (items ?? []) as DiningOrderItemRow[];
    const itemIds = itemRows.map((item) => item.id);
    const [allocResult, paymentsResult] = await Promise.all([
      itemIds.length ? admin.from("tab_item_allocations").select("order_item_id, tab_member_id, quantity")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("tab_id", tab.id).in("order_item_id", itemIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? admin.from("payments").select("id, order_id, method, status, amount_cents, change_due_cents, metadata, paid_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("order_id", orderIds).eq("status", "paid").order("paid_at") : Promise.resolve({ data: [], error: null }),
    ]);
    if (allocResult.error) throw allocResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const validOrderIds = new Set(orders.filter((order) => !["canceled", "rejected"].includes(order.order_status)).map((order) => order.id));
    const totalCents = orders.filter((order) => validOrderIds.has(order.id)).reduce((sum, order) => sum + Number(order.total_cents), 0);
    const paidCents = (paymentsResult.data ?? []).filter((payment) => validOrderIds.has(payment.order_id)).reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
    const allocations = allocResult.data ?? [];
    const itemById = new Map(itemRows.map((item) => [item.id, item]));
    const memberAccounts = (membersResult.data ?? []).map((member) => {
      const allocated = allocations.filter((allocation) => allocation.tab_member_id === member.id)
        .reduce((sum, allocation) => sum + Number(allocation.quantity) * Number(itemById.get(allocation.order_item_id)?.unit_total_price_cents ?? 0), 0);
      const paid = (paymentsResult.data ?? []).filter((payment) => paymentMemberId(payment.metadata) === member.id)
        .reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
      return { ...member, allocated_cents: allocated, paid_cents: paid, due_cents: Math.max(0, allocated - paid) };
    });
    const itemsByOrder = new Map<string, DiningOrderItemRow[]>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }
    return {
      context, table, tab, members: membersResult.data ?? [], allocations,
      orders: orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] })),
      account: { totalCents, paidCents, dueCents: Math.max(0, totalCents - paidCents) },
      memberAccounts, targets: targets ?? [], payments: paymentsResult.data ?? [], ...catalog,
    };
  }

  static async createTable(input: DiningTableInput) {
    const values = diningTableInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.DINING_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("tables").insert({
      organization_id: context.organizationId, store_id: storeId, code: values.code, name: values.name,
      capacity: values.capacity, area: values.area ?? null, qr_enabled: values.qrEnabled,
      created_by: context.userId, updated_by: context.userId,
    }).select("id, code, name, capacity, status, area, qr_enabled, public_code").single();
    if (error) throw error;
    await AuditService.record(context, { action: "dining.table_created", entityType: "table", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "dining.table_created", entityType: "table", entityId: data.id, payload: { code: data.code, name: data.name } });
    return data;
  }

  static async setTableStatus(tableId: string, status: string) {
    const { context, table, admin } = await requireScopedTable(PERMISSIONS.DINING_MANAGE, tableId);
    const { data, error } = await admin.rpc("dining_set_table_status_internal", { p_table_id: table.id, p_status: tableStatusSchema.parse(status), p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async rotateQr(tableId: string) {
    const { context, table, admin } = await requireScopedTable(PERMISSIONS.DINING_MANAGE, tableId);
    const { data, error } = await admin.rpc("dining_rotate_table_code_internal", { p_table_id: table.id, p_actor_user_id: context.userId });
    if (error) throw error;
    return data as string;
  }

  static async openTab(tableId: string, guestCount: number, label?: string | null) {
    const { context, table, admin } = await requireScopedTable(PERMISSIONS.DINING_MANAGE, tableId);
    const { data, error } = await admin.rpc("dining_open_tab_internal", { p_table_id: table.id, p_guest_count: Math.max(1, Math.min(100, Math.trunc(guestCount))), p_label: label?.trim() || null, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async transferTab(tabId: string, targetTableId: string) {
    const scoped = await requireScopedTab(PERMISSIONS.DINING_MANAGE, tabId);
    const target = await requireScopedTable(PERMISSIONS.DINING_MANAGE, targetTableId);
    if (scoped.context.organizationId !== target.context.organizationId || scoped.storeId !== target.storeId) throw new Error("Mesa de destino inválida");
    const { data, error } = await scoped.admin.rpc("dining_transfer_tab_internal", { p_tab_id: scoped.tab.id, p_target_table_id: target.table.id, p_actor_user_id: scoped.context.userId });
    if (error) throw error;
    return data;
  }

  static async addMember(tabId: string, input: DiningMemberInput) {
    const values = diningMemberInputSchema.parse(input);
    const { context, tab, admin } = await requireScopedTab(PERMISSIONS.DINING_MANAGE, tabId);
    const { data, error } = await admin.rpc("dining_add_member_internal", { p_tab_id: tab.id, p_name: values.name, p_customer_id: values.customerId ?? null, p_seat_number: values.seatNumber ?? null, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async allocateItem(tabId: string, orderItemId: string, memberId: string, quantity: number) {
    const { context, tab, admin } = await requireScopedTab(PERMISSIONS.DINING_MANAGE, tabId);
    const { data, error } = await admin.rpc("dining_allocate_item_internal", { p_tab_id: tab.id, p_order_item_id: uuidSchema.parse(orderItemId), p_tab_member_id: uuidSchema.parse(memberId), p_quantity: Math.max(1, Math.trunc(quantity)), p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async createRound(tabId: string, input: DiningRoundInput, idempotencyKey: string) {
    const values = diningRoundInputSchema.parse(input);
    const { context, tab, admin } = await requireScopedTab(PERMISSIONS.DINING_ORDER, tabId);
    const { data, error } = await admin.rpc("dining_create_round_internal", {
      p_tab_id: tab.id,
      p_items: values.items.map((item) => ({ product_id: item.productId, quantity: item.quantity, note: item.note, modifier_ids: item.modifierIds })),
      p_idempotency_key: idemSchema.parse(idempotencyKey), p_actor_user_id: context.userId, p_channel: "waiter",
    });
    if (error) throw error;
    return z.object({ order_id: z.string().uuid(), display_number: z.coerce.number(), round_number: z.coerce.number(), total_cents: z.coerce.number(), created: z.boolean() }).parse(data);
  }

  static async setTabStatus(tabId: string, status: "settling" | "closed" | "canceled", reason?: string | null) {
    const permission = status === "canceled" ? PERMISSIONS.DINING_MANAGE : PERMISSIONS.DINING_SETTLE;
    const { context, tab, admin } = await requireScopedTab(permission, tabId);
    const { data, error } = await admin.rpc("dining_set_tab_status_internal", { p_tab_id: tab.id, p_status: status, p_reason: reason?.trim() || null, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async payTab(tabId: string, input: DiningPaymentInput, idempotencyKey: string = randomUUID()) {
    const values = diningPaymentInputSchema.parse(input);
    const { context, tab, admin } = await requireScopedTab(PERMISSIONS.DINING_SETTLE, tabId);
    const { data, error } = await admin.rpc("dining_pay_tab_internal", {
      p_tab_id: tab.id, p_amount_cents: values.amountCents, p_method: values.method,
      p_idempotency_key: idemSchema.parse(idempotencyKey), p_cash_tendered_cents: values.cashTenderedCents ?? null,
      p_reference: values.reference ?? null, p_tab_member_id: values.tabMemberId ?? null, p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }
}
