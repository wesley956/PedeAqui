import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { paymentMethodSchema, type PaymentMethod } from "@/server/checkout/schemas";
import { AuditService } from "@/server/audit/audit-service";

export const defaultPaymentMethods: Array<{ method: PaymentMethod; enabled: boolean; sortOrder: number }> = [
  { method: "pix", enabled: true, sortOrder: 10 },
  { method: "credit_card", enabled: true, sortOrder: 20 },
  { method: "debit_card", enabled: true, sortOrder: 30 },
  { method: "cash", enabled: true, sortOrder: 40 },
];

export class StorePaymentMethodService {
  static async listForStore(organizationId: string, storeId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_payment_methods")
      .select("method, enabled, sort_order")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .order("sort_order");
    if (error) throw error;
    if (!data || data.length === 0) return defaultPaymentMethods;
    return data.map((row) => ({ method: paymentMethodSchema.parse(row.method), enabled: row.enabled, sortOrder: row.sort_order }));
  }

  static async listCurrentStore() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    if (!context.storeId) throw new Error("An active store is required");
    return this.listForStore(context.organizationId, context.storeId);
  }

  static async save(enabledMethods: PaymentMethod[]) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const unique = new Set(enabledMethods.map((method) => paymentMethodSchema.parse(method)));
    if (unique.size === 0) throw new Error("At least one payment method is required");
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const rows = defaultPaymentMethods.map((item) => ({
      organization_id: context.organizationId,
      store_id: context.storeId,
      method: item.method,
      enabled: unique.has(item.method),
      sort_order: item.sortOrder,
      updated_at: now,
    }));
    const { data: before } = await admin.from("store_payment_methods")
      .select("method, enabled, sort_order")
      .eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .order("sort_order");
    const { error } = await admin.from("store_payment_methods").upsert(rows, { onConflict: "store_id,method" });
    if (error) throw error;
    await AuditService.record(context, {
      action: "store.payment_methods_updated",
      entityType: "store",
      entityId: context.storeId,
      before: before ?? [],
      after: rows.map(({ method, enabled, sort_order }) => ({ method, enabled, sort_order })),
    });
    return rows;
  }
}
