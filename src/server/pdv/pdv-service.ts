import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import { posSaleSchema, type PosSaleInput } from "@/server/pdv/schemas";
import type {
  PosCategory,
  PosCoupon,
  PosCustomer,
  PosGrowthSettings,
  PosModifierGroup,
  PosPaymentMethod,
  PosPaymentMethodOption,
  PosProduct,
} from "@/features/pdv/model";

const idempotencySchema = z.string().trim().min(8).max(200);
const resultSchema = z.object({
  order_id: z.string().uuid(),
  display_number: z.coerce.number().int().positive(),
  subtotal_cents: z.coerce.number().int().nonnegative().optional(),
  discount_cents: z.coerce.number().int().nonnegative().optional(),
  total_cents: z.coerce.number().int().nonnegative(),
  change_due_cents: z.coerce.number().int().nonnegative(),
  created: z.boolean(),
});

const paymentLabels: Record<PosPaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
};

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária para abrir o PDV");
  return storeId;
}

async function canViewCustomers(context: Awaited<ReturnType<typeof authorize>>) {
  try {
    await authorize(PERMISSIONS.CUSTOMERS_VIEW, context);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

export class PdvService {
  static async load() {
    const context = await authorize(PERMISSIONS.ORDERS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const [categoriesResult, productsResult, linksResult, groupsResult, modifiersResult, paymentMethods, customerAccess, growthSettingsResult, couponsResult] = await Promise.all([
      admin.from("categories").select("id, name, sort_order").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).order("sort_order").order("name"),
      admin.from("products").select("id, category_id, name, description, sku, barcode, price_cents, promotional_price_cents").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).eq("availability", "available").is("deleted_at", null).order("name"),
      admin.from("product_modifier_groups").select("product_id, modifier_group_id, sort_order").eq("organization_id", context.organizationId).eq("store_id", storeId).order("sort_order"),
      admin.from("modifier_groups").select("id, name, min_selection, max_selection, required, sort_order").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).order("sort_order"),
      admin.from("modifiers").select("id, modifier_group_id, name, price_cents, sort_order").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).order("sort_order"),
      StorePaymentMethodService.listForStore(context.organizationId, storeId),
      canViewCustomers(context),
      admin.from("store_growth_settings").select("cashback_enabled, loyalty_enabled, loyalty_redeem_cents_per_point").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("coupons").select("id, code, name, discount_type, fixed_discount_cents, percentage_bps, max_discount_cents, minimum_order_cents, valid_from, valid_until, allowed_channels")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).contains("allowed_channels", ["pdv"]).order("created_at", { ascending: false }),
    ]);

    for (const result of [categoriesResult, productsResult, linksResult, groupsResult, modifiersResult, growthSettingsResult, couponsResult]) {
      if (result.error) throw result.error;
    }

    const categories: PosCategory[] = (categoriesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, sortOrder: Number(row.sort_order) }));
    const activeCategoryIds = new Set(categories.map((category) => category.id));

    const modifiersByGroup = new Map<string, Array<{ id: string; name: string; priceCents: number; sortOrder: number }>>();
    for (const row of modifiersResult.data ?? []) {
      const list = modifiersByGroup.get(row.modifier_group_id) ?? [];
      list.push({ id: row.id, name: row.name, priceCents: Number(row.price_cents), sortOrder: Number(row.sort_order) });
      modifiersByGroup.set(row.modifier_group_id, list);
    }

    const groupsById = new Map<string, PosModifierGroup>();
    for (const row of groupsResult.data ?? []) {
      groupsById.set(row.id, {
        id: row.id, name: row.name, minSelection: Number(row.min_selection), maxSelection: Number(row.max_selection), required: Boolean(row.required), sortOrder: Number(row.sort_order),
        modifiers: (modifiersByGroup.get(row.id) ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")).map(({ id, name, priceCents }) => ({ id, name, priceCents })),
      });
    }

    const groupIdsByProduct = new Map<string, string[]>();
    for (const row of linksResult.data ?? []) {
      if (!groupsById.has(row.modifier_group_id)) continue;
      const list = groupIdsByProduct.get(row.product_id) ?? [];
      list.push(row.modifier_group_id);
      groupIdsByProduct.set(row.product_id, list);
    }

    const products: PosProduct[] = (productsResult.data ?? []).filter((row) => row.category_id === null || activeCategoryIds.has(row.category_id)).map((row) => ({
      id: row.id, categoryId: row.category_id, name: row.name, description: row.description, sku: row.sku, barcode: row.barcode,
      priceCents: Number(row.promotional_price_cents ?? row.price_cents),
      modifierGroups: (groupIdsByProduct.get(row.id) ?? []).map((groupId) => groupsById.get(groupId)).filter((group): group is PosModifierGroup => Boolean(group)),
    }));

    let customers: PosCustomer[] = [];
    if (customerAccess) {
      const [customerResult, cashbackResult, loyaltyResult] = await Promise.all([
        admin.from("customers").select("id, name, phone, email").eq("organization_id", context.organizationId).is("deleted_at", null).order("last_order_at", { ascending: false, nullsFirst: false }).order("name").limit(150),
        admin.from("cashback_accounts").select("customer_id, balance_cents").eq("organization_id", context.organizationId).eq("store_id", storeId),
        admin.from("loyalty_accounts").select("customer_id, balance_points").eq("organization_id", context.organizationId).eq("store_id", storeId),
      ]);
      for (const result of [customerResult, cashbackResult, loyaltyResult]) if (result.error) throw result.error;
      const cashbackMap = new Map((cashbackResult.data ?? []).map((row) => [row.customer_id, Number(row.balance_cents)]));
      const loyaltyMap = new Map((loyaltyResult.data ?? []).map((row) => [row.customer_id, Number(row.balance_points)]));
      customers = (customerResult.data ?? []).map((row) => ({
        id: row.id, name: row.name, phone: row.phone, email: row.email,
        cashbackBalanceCents: cashbackMap.get(row.id) ?? 0,
        loyaltyBalancePoints: loyaltyMap.get(row.id) ?? 0,
      }));
    }

    const methods: PosPaymentMethodOption[] = paymentMethods.filter((item) => item.enabled).map((item) => ({ method: item.method as PosPaymentMethod, label: paymentLabels[item.method as PosPaymentMethod] }));
    const now = Date.now();
    const coupons: PosCoupon[] = (couponsResult.data ?? []).filter((row) => {
      const from = Date.parse(row.valid_from);
      const until = row.valid_until ? Date.parse(row.valid_until) : Number.POSITIVE_INFINITY;
      return from <= now && until > now;
    }).map((row) => ({
      id: row.id, code: row.code, name: row.name, discountType: row.discount_type as "fixed" | "percentage",
      fixedDiscountCents: row.fixed_discount_cents === null ? null : Number(row.fixed_discount_cents),
      percentageBps: row.percentage_bps === null ? null : Number(row.percentage_bps),
      maxDiscountCents: row.max_discount_cents === null ? null : Number(row.max_discount_cents),
      minimumOrderCents: Number(row.minimum_order_cents),
    }));
    const growthSettings: PosGrowthSettings = {
      cashbackEnabled: Boolean(growthSettingsResult.data?.cashback_enabled),
      loyaltyEnabled: Boolean(growthSettingsResult.data?.loyalty_enabled),
      loyaltyRedeemCentsPerPoint: Number(growthSettingsResult.data?.loyalty_redeem_cents_per_point ?? 1),
    };

    return { categories, products, customers, paymentMethods: methods, coupons, growthSettings, sessionNonce: randomUUID() };
  }

  static async createSale(input: PosSaleInput, idempotencyKey: string) {
    const values = posSaleSchema.parse(input);
    const safeKey = idempotencySchema.parse(idempotencyKey);
    const context = await authorize(PERMISSIONS.ORDERS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("pdv_create_order_growth_internal", {
      p_store_id: storeId,
      p_items: values.items.map((item) => ({ product_id: item.productId, quantity: item.quantity, note: item.note, modifier_ids: item.modifierIds })),
      p_payments: values.payments.map((payment) => ({ method: payment.method, amount_cents: payment.amountCents, cash_received_cents: payment.cashReceivedCents ?? null, reference: payment.reference ?? null })),
      p_customer: values.customer ? { id: values.customer.id ?? null, name: values.customer.name ?? null, phone: values.customer.phone ?? null, email: values.customer.email ?? null } : null,
      p_growth: { coupon_code: values.growth.couponCode ?? null, cashback_redeem_cents: values.growth.cashbackRedeemCents, loyalty_redeem_points: values.growth.loyaltyRedeemPoints },
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    const parsed = resultSchema.parse(data);
    return { orderId: parsed.order_id, displayNumber: parsed.display_number, totalCents: parsed.total_cents, changeDueCents: parsed.change_due_cents, created: parsed.created };
  }
}
