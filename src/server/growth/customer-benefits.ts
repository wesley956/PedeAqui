import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isPromotionActive, type ProductPromotion } from "@/server/promotions/promotion-service";

export type CustomerCouponBenefit = {
  id: string;
  code: string;
  name: string;
  discount_type: "fixed" | "percentage";
  fixed_discount_cents: number | null;
  percentage_bps: number | null;
  max_discount_cents: number | null;
  minimum_order_cents: number;
  valid_until: string | null;
  eligible_for_subtotal: boolean;
  discount_cents: number | null;
};

export type CustomerPromotionBenefit = {
  productName: string;
  promotionalPriceCents: number;
  label: string | null;
};

export type CustomerBenefits = {
  identified: boolean;
  available: boolean;
  reason?: string;
  cashbackEnabled: boolean;
  cashbackBalanceCents: number;
  loyaltyEnabled: boolean;
  loyaltyBalancePoints: number;
  loyaltyRedeemCentsPerPoint: number;
  coupons: CustomerCouponBenefit[];
  promotions: CustomerPromotionBenefit[];
  evaluatedAt: string | null;
};

const unidentified: CustomerBenefits = {
  identified: false,
  available: false,
  reason: "customer_not_linked",
  cashbackEnabled: false,
  cashbackBalanceCents: 0,
  loyaltyEnabled: false,
  loyaltyBalancePoints: 0,
  loyaltyRedeemCentsPerPoint: 0,
  coupons: [],
  promotions: [],
  evaluatedAt: null,
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export async function loadCustomerBenefits(input: {
  organizationId: string;
  storeId: string;
  customerId: string | null;
  contactId: string;
  timeZone: string;
  subtotalCents?: number | null;
}): Promise<CustomerBenefits> {
  const admin = createAdminClient();
  const [benefitsResult, promotionsResult] = await Promise.all([
    input.customerId ? admin.rpc("growth_customer_benefits_internal", {
      p_store_id: input.storeId,
      p_customer_id: input.customerId,
      p_contact_id: input.contactId,
      p_channel: "digital_menu",
      p_subtotal_cents: input.subtotalCents ?? null,
    }) : Promise.resolve({ data: unidentified, error: null }),
    admin.from("product_promotions")
      .select("id,promotion_group_id,campaign_name,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("active", true),
  ]);
  if (benefitsResult.error) throw benefitsResult.error;
  if (promotionsResult.error) throw promotionsResult.error;

  const raw = (benefitsResult.data ?? {}) as Record<string, unknown>;
  const schedules = ((promotionsResult.data ?? []) as ProductPromotion[])
    .filter((promotion) => isPromotionActive(promotion, input.timeZone));
  const productIds = [...new Set(schedules.map((promotion) => promotion.product_id))];
  const productResult = productIds.length > 0
    ? await admin.from("products").select("id,name").eq("organization_id", input.organizationId).eq("store_id", input.storeId).in("id", productIds).eq("active", true).is("deleted_at", null)
    : { data: [], error: null };
  if (productResult.error) throw productResult.error;
  const productNames = new Map((productResult.data ?? []).map((product) => [product.id, product.name]));

  return {
    identified: raw.identified === true,
    available: raw.available === true,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    cashbackEnabled: raw.cashback_enabled === true,
    cashbackBalanceCents: number(raw.cashback_balance_cents),
    loyaltyEnabled: raw.loyalty_enabled === true,
    loyaltyBalancePoints: number(raw.loyalty_balance_points),
    loyaltyRedeemCentsPerPoint: number(raw.loyalty_redeem_cents_per_point),
    coupons: Array.isArray(raw.coupons) ? raw.coupons as CustomerCouponBenefit[] : [],
    promotions: schedules.flatMap((promotion) => {
      const productName = productNames.get(promotion.product_id);
      return productName ? [{ productName, promotionalPriceCents: number(promotion.promotional_price_cents), label: promotion.label }] : [];
    }).slice(0, 5),
    evaluatedAt: typeof raw.evaluated_at === "string" ? raw.evaluated_at : null,
  };
}
