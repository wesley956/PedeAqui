"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoneyToCents } from "@/server/catalog/money";
import { cartCookieName } from "@/server/cart/cart-token";
import { GrowthService } from "@/server/growth/growth-service";

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function optionalPositiveInt(formData: FormData, key: string) {
  const value = optional(formData, key);
  if (!value) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function optionalMoney(formData: FormData, key: string) {
  const value = optional(formData, key);
  return value ? parseMoneyToCents(value) : undefined;
}

function percentToBps(value: string | null) {
  if (!value) return 0;
  const normalized = value.replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error("Percentual inválido");
  return Math.round(number * 100);
}

export async function saveGrowthSettingsAction(formData: FormData) {
  await GrowthService.saveSettings({
    cashbackEnabled: formData.get("cashbackEnabled") === "on",
    cashbackRateBps: percentToBps(optional(formData, "cashbackRate")),
    cashbackMinOrderCents: optionalMoney(formData, "cashbackMinOrder") ?? 0,
    cashbackExpiryDays: optionalPositiveInt(formData, "cashbackExpiryDays") ?? null,
    loyaltyEnabled: formData.get("loyaltyEnabled") === "on",
    loyaltySpendCentsPerPoint: parseMoneyToCents(String(formData.get("loyaltySpendPerPoint") ?? "1,00")),
    loyaltyRedeemCentsPerPoint: parseMoneyToCents(String(formData.get("loyaltyRedeemPerPoint") ?? "0,01")),
  });
  revalidatePath("/crescimento");
}

export async function createCouponAction(formData: FormData) {
  const discountType = String(formData.get("discountType") ?? "fixed") as "fixed" | "percentage";
  const discountRaw = String(formData.get("discountValue") ?? "");
  const validUntilRaw = optional(formData, "validUntil");
  await GrowthService.createCoupon({
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    discountType,
    fixedDiscountCents: discountType === "fixed" ? parseMoneyToCents(discountRaw) : null,
    percentageBps: discountType === "percentage" ? percentToBps(discountRaw) : null,
    maxDiscountCents: optionalMoney(formData, "maxDiscount") ?? null,
    minimumOrderCents: optionalMoney(formData, "minimumOrder") ?? 0,
    usageLimitTotal: optionalPositiveInt(formData, "usageLimitTotal") ?? null,
    usageLimitPerCustomer: optionalPositiveInt(formData, "usageLimitPerCustomer") ?? null,
    validUntil: validUntilRaw ? new Date(validUntilRaw).toISOString() : null,
  });
  revalidatePath("/crescimento");
}

export async function createSegmentAction(formData: FormData) {
  await GrowthService.createSegment({
    name: String(formData.get("name") ?? ""),
    description: optional(formData, "description"),
    ordersCountMin: optionalPositiveInt(formData, "ordersCountMin"),
    totalSpentCentsMin: optionalMoney(formData, "totalSpentMin"),
    averageTicketCentsMin: optionalMoney(formData, "averageTicketMin"),
    inactiveDaysMin: optionalPositiveInt(formData, "inactiveDaysMin"),
    lastOrderDaysMax: optionalPositiveInt(formData, "lastOrderDaysMax"),
    hasCashbackBalance: formData.get("hasCashbackBalance") === "on",
    hasLoyaltyBalance: formData.get("hasLoyaltyBalance") === "on",
  });
  revalidatePath("/crescimento");
}

export async function createCampaignAction(formData: FormData) {
  await GrowthService.createCampaign({
    name: String(formData.get("name") ?? ""),
    objective: optional(formData, "objective"),
    channel: String(formData.get("channel") ?? "internal") as "internal" | "whatsapp" | "email",
    content: String(formData.get("content") ?? ""),
    segmentId: optional(formData, "segmentId"),
  });
  revalidatePath("/crescimento");
}

export async function createAutomationAction(formData: FormData) {
  const actionType = String(formData.get("actionType") ?? "bonus_points") as "campaign" | "bonus_cashback" | "bonus_points";
  await GrowthService.createAutomation({
    name: String(formData.get("name") ?? ""),
    triggerType: String(formData.get("triggerType") ?? "order.completed") as "order.completed" | "customer.inactive" | "customer.birthday",
    actionType,
    minimumTotalCents: optionalMoney(formData, "minimumTotal"),
    channel: optional(formData, "orderChannel") ?? undefined,
    inactiveDays: optionalPositiveInt(formData, "inactiveDays"),
    campaignId: actionType === "campaign" ? optional(formData, "campaignId") : null,
    bonusCashbackCents: actionType === "bonus_cashback" ? optionalMoney(formData, "bonusCashback") : undefined,
    bonusPoints: actionType === "bonus_points" ? optionalPositiveInt(formData, "bonusPoints") : undefined,
  });
  revalidatePath("/crescimento");
}

export async function prepareCampaignAction(formData: FormData) {
  await GrowthService.prepareCampaign(String(formData.get("campaignId") ?? ""));
  revalidatePath("/crescimento");
}

export async function runGrowthAutomationsAction() {
  await GrowthService.runScheduled();
  revalidatePath("/crescimento");
}

async function publicCartToken(storeSlug: string) {
  return (await cookies()).get(cartCookieName(storeSlug))?.value ?? null;
}

export async function applyCheckoutBenefitsAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await publicCartToken(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  try {
    await GrowthService.applyCartBenefits(storeSlug, token, {
      couponCode: optional(formData, "couponCode"),
      cashbackRedeemCents: optionalMoney(formData, "cashbackAmount") ?? 0,
      loyaltyRedeemPoints: optionalPositiveInt(formData, "loyaltyPoints") ?? 0,
    });
  } catch {
    redirect(`/m/${storeSlug}/checkout?erro=benefit_invalid`);
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function clearCheckoutBenefitsAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await publicCartToken(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  await GrowthService.clearCartBenefits(storeSlug, token);
  redirect(`/m/${storeSlug}/checkout`);
}
