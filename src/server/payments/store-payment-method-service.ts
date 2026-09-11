import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { paymentMethodSchema, type PaymentMethod } from "@/server/checkout/schemas";
import { AuditService } from "@/server/audit/audit-service";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";

export const defaultPaymentMethods: Array<{ method: Exclude<PaymentMethod, "custom">; enabled: boolean; sortOrder: number }> = [
  { method: "pix", enabled: true, sortOrder: 10 },
  { method: "credit_card", enabled: true, sortOrder: 20 },
  { method: "debit_card", enabled: true, sortOrder: 30 },
  { method: "cash", enabled: true, sortOrder: 40 },
];

export type StorePaymentMethodOption = {
  method: PaymentMethod;
  enabled: boolean;
  sortOrder: number;
  customPaymentMethodId?: string;
  label?: string;
};

const reservedNames = new Set([
  "pix",
  "dinheiro",
  "cartao de credito",
  "cartão de crédito",
  "cartao de debito",
  "cartão de débito",
]);

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateCustomName(value: string) {
  const name = normalizeName(value);
  if (name.length < 2 || name.length > 60) throw new Error("Nome da forma de pagamento deve ter entre 2 e 60 caracteres");
  if (reservedNames.has(name.toLocaleLowerCase("pt-BR"))) throw new Error("Esta forma de pagamento já existe entre as opções padrão");
  return name;
}

export class StorePaymentMethodService {
  private static async listConfiguredForStore(organizationId: string, storeId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_payment_methods")
      .select("method, enabled, sort_order")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .order("sort_order");
    if (error) throw error;
    if (!data || data.length === 0) return defaultPaymentMethods;
    return data.map((row) => ({
      method: paymentMethodSchema.exclude(["custom"]).parse(row.method),
      enabled: row.enabled,
      sortOrder: row.sort_order,
    }));
  }

  private static async listCustomForStore(organizationId: string, storeId: string, includeDisabled = true) {
    const admin = createAdminClient();
    let query = admin.from("store_custom_payment_methods")
      .select("id, name, enabled, sort_order")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .is("archived_at", null)
      .order("sort_order")
      .order("created_at");
    if (!includeDisabled) query = query.eq("enabled", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      sortOrder: row.sort_order,
    }));
  }

  // Public checkout availability. PIX is only offered when its online provider
  // is explicitly enabled and both server-side secrets are configured.
  static async listForStore(organizationId: string, storeId: string): Promise<StorePaymentMethodOption[]> {
    const [methods, customMethods, onlinePixReady] = await Promise.all([
      this.listConfiguredForStore(organizationId, storeId),
      this.listCustomForStore(organizationId, storeId),
      OrderPaymentProviderConfigService.isOnlinePixReady(organizationId, storeId),
    ]);
    const standard: StorePaymentMethodOption[] = methods.map((item) => item.method === "pix"
      ? { ...item, enabled: item.enabled && onlinePixReady }
      : item);
    const custom: StorePaymentMethodOption[] = customMethods.map((item) => ({
      method: "custom",
      enabled: item.enabled,
      sortOrder: item.sortOrder,
      customPaymentMethodId: item.id,
      label: item.name,
    }));
    return [...standard, ...custom].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  static async listForCheckout(organizationId: string, storeId: string) {
    return this.listForStore(organizationId, storeId);
  }

  static async listCurrentStore() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    if (!context.storeId) throw new Error("An active store is required");
    return this.listConfiguredForStore(context.organizationId, context.storeId);
  }

  static async listCustomCurrentStore() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    if (!context.storeId) throw new Error("An active store is required");
    return this.listCustomForStore(context.organizationId, context.storeId);
  }

  static async save(enabledMethods: PaymentMethod[]) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const standardSchema = paymentMethodSchema.exclude(["custom"]);
    const unique = new Set(enabledMethods.filter((method) => method !== "custom").map((method) => standardSchema.parse(method)));
    const customMethods = await this.listCustomForStore(context.organizationId, context.storeId);
    if (unique.size === 0 && !customMethods.some((item) => item.enabled)) throw new Error("At least one payment method is required");
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

  static async createCustom(nameInput: string) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const name = validateCustomName(nameInput);
    const admin = createAdminClient();
    const current = await this.listCustomForStore(context.organizationId, context.storeId);
    const nextSortOrder = Math.max(90, ...current.map((item) => item.sortOrder)) + 10;
    const { data, error } = await admin.from("store_custom_payment_methods").insert({
      organization_id: context.organizationId,
      store_id: context.storeId,
      name,
      enabled: true,
      sort_order: nextSortOrder,
    }).select("id, name, enabled, sort_order").single();
    if (error?.code === "23505") throw new Error("Esta forma de pagamento já foi cadastrada");
    if (error) throw error;
    await AuditService.record(context, {
      action: "store.custom_payment_method_created",
      entityType: "store_custom_payment_method",
      entityId: data.id,
      before: null,
      after: data,
    });
    return data;
  }

  static async renameCustom(id: string, nameInput: string) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const name = validateCustomName(nameInput);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("store_custom_payment_methods")
      .select("id, name, enabled, sort_order")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .is("archived_at", null).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw new Error("Forma de pagamento não encontrada");
    const { data, error } = await admin.from("store_custom_payment_methods")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .is("archived_at", null)
      .select("id, name, enabled, sort_order").single();
    if (error?.code === "23505") throw new Error("Esta forma de pagamento já foi cadastrada");
    if (error) throw error;
    await AuditService.record(context, {
      action: "store.custom_payment_method_updated",
      entityType: "store_custom_payment_method",
      entityId: id,
      before,
      after: data,
    });
    return data;
  }

  static async setCustomEnabled(id: string, enabled: boolean) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    if (!enabled) {
      const [standard, custom] = await Promise.all([
        this.listConfiguredForStore(context.organizationId, context.storeId),
        this.listCustomForStore(context.organizationId, context.storeId),
      ]);
      const otherEnabled = standard.some((item) => item.enabled) || custom.some((item) => item.id !== id && item.enabled);
      if (!otherEnabled) throw new Error("At least one payment method is required");
    }
    const { data: before, error: beforeError } = await admin.from("store_custom_payment_methods")
      .select("id, name, enabled, sort_order")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .is("archived_at", null).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw new Error("Forma de pagamento não encontrada");
    const { data, error } = await admin.from("store_custom_payment_methods")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId)
      .is("archived_at", null)
      .select("id, name, enabled, sort_order").single();
    if (error) throw error;
    await AuditService.record(context, {
      action: "store.custom_payment_method_toggled",
      entityType: "store_custom_payment_method",
      entityId: id,
      before,
      after: data,
    });
    return data;
  }

  static async archiveCustom(id: string) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const [standard, custom] = await Promise.all([
      this.listConfiguredForStore(context.organizationId, context.storeId),
      this.listCustomForStore(context.organizationId, context.storeId),
    ]);
    const target = custom.find((item) => item.id === id);
    if (!target) throw new Error("Forma de pagamento não encontrada");
    if (target.enabled) {
      const otherEnabled = standard.some((item) => item.enabled) || custom.some((item) => item.id !== id && item.enabled);
      if (!otherEnabled) throw new Error("At least one payment method is required");
    }
    const archivedAt = new Date().toISOString();
    const { error } = await admin.from("store_custom_payment_methods")
      .update({ enabled: false, archived_at: archivedAt, updated_at: archivedAt })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId);
    if (error) throw error;
    await AuditService.record(context, {
      action: "store.custom_payment_method_archived",
      entityType: "store_custom_payment_method",
      entityId: id,
      before: target,
      after: { ...target, enabled: false, archived_at: archivedAt },
    });
  }
}
