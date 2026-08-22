"use server";

import { revalidatePath } from "next/cache";
import { PlatformCommercialBillingService } from "@/server/platform/platform-commercial-billing-service";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const common = (form: FormData) => ({
  organizationId: text(form, "organizationId"),
  reason: text(form, "reason"),
  protocol: text(form, "protocol"),
  idempotencyKey: text(form, "idempotencyKey"),
});

function refresh() {
  revalidatePath("/platform");
  revalidatePath("/platform/assinaturas");
}

function optional(form: FormData, key: string) {
  return text(form, key) || null;
}

export async function startOrExtendTrialAction(form: FormData) {
  await PlatformCommercialBillingService.startOrExtendTrial({
    ...common(form),
    planId: text(form, "planId"),
    billingInterval: text(form, "billingInterval") as "month" | "year" | "manual",
    trialEndsAt: new Date(text(form, "trialEndsAt")).toISOString(),
  });
  refresh();
}

export async function activateSubscriptionAction(form: FormData) {
  await PlatformCommercialBillingService.activateOrChangePlan({
    ...common(form),
    planId: text(form, "planId"),
    billingInterval: text(form, "billingInterval") as "month" | "year" | "manual",
  });
  refresh();
}

export async function changePlanAction(form: FormData) {
  await PlatformCommercialBillingService.keepStatusAndChangePlan({
    ...common(form),
    planId: text(form, "planId"),
    billingInterval: text(form, "billingInterval") as "month" | "year" | "manual",
  });
  refresh();
}

export async function scheduleCancellationAction(form: FormData) {
  await PlatformCommercialBillingService.scheduleCancellation(common(form));
  refresh();
}

export async function cancelSubscriptionNowAction(form: FormData) {
  await PlatformCommercialBillingService.cancelNow(common(form));
  refresh();
}

export async function applyGracePeriodAction(form: FormData) {
  await PlatformCommercialBillingService.applyGracePeriod({
    ...common(form),
    graceEndsAt: new Date(text(form, "graceEndsAt")).toISOString(),
  });
  refresh();
}

export async function updateCommercialTermsAction(form: FormData) {
  const price = Number(text(form, "agreedPrice"));
  const dueDay = Number(text(form, "billingDueDay"));
  const nextDue = optional(form, "nextDueAt");
  await PlatformCommercialBillingService.updateCommercialTerms({
    ...common(form),
    agreedPriceCents: Number.isFinite(price) ? Math.round(price * 100) : -1,
    priceLocked: form.get("priceLocked") === "on",
    priceLockReason: optional(form, "priceLockReason"),
    billingDueDay: Number.isInteger(dueDay) && dueDay > 0 ? dueDay : null,
    nextDueAt: nextDue ? new Date(nextDue).toISOString() : null,
    paymentStatus: text(form, "paymentStatus") as "not_started" | "pending" | "paid" | "overdue" | "waived",
  });
  refresh();
}
