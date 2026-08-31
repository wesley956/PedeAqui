"use server";

import { revalidatePath } from "next/cache";
import { PlatformCommercialBillingService } from "@/server/platform/platform-commercial-billing-service";
import { PlatformModuleRequestService } from "@/server/platform/platform-module-request-service";

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
  revalidatePath("/configuracoes/modulos");
}

function optional(form: FormData, key: string) {
  return text(form, key) || null;
}

function cents(form: FormData, key: string) {
  const value = Number(text(form, key));
  return Number.isFinite(value) ? Math.round(value * 100) : -1;
}

function iso(form: FormData, key: string) {
  const value = text(form, key);
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export async function startOrExtendTrialAction(form: FormData) {
  await PlatformCommercialBillingService.startOrExtendTrial({
    ...common(form),
    planId: text(form, "planId"),
    billingInterval: text(form, "billingInterval") as "month" | "year" | "manual",
    trialEndsAt: iso(form, "trialEndsAt"),
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
    graceEndsAt: iso(form, "graceEndsAt"),
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
    nextDueAt: nextDue ? iso(form, "nextDueAt") : null,
    paymentStatus: text(form, "paymentStatus") as "not_started" | "pending" | "paid" | "overdue" | "waived",
  });
  refresh();
}

export async function saveCommercialPlanAction(form: FormData) {
  const monthly = optional(form, "monthlyPrice");
  const yearly = optional(form, "yearlyPrice");
  await PlatformCommercialBillingService.savePlan({
    planId: optional(form, "planId"),
    key: text(form, "key"),
    name: text(form, "name"),
    description: optional(form, "description"),
    monthlyPriceCents: monthly === null ? null : cents(form, "monthlyPrice"),
    yearlyPriceCents: yearly === null ? null : cents(form, "yearlyPrice"),
    active: form.get("active") === "on",
    position: Number(text(form, "position")),
    featureIds: form.getAll("featureIds").filter((value): value is string => typeof value === "string"),
    reason: text(form, "reason"),
    protocol: text(form, "protocol"),
  });
  refresh();
}

export async function applySubscriptionAdjustmentAction(form: FormData) {
  const kind = text(form, "kind") as "discount_percent" | "discount_amount" | "credit";
  const percentageValue = Number(text(form, "percentage"));
  await PlatformCommercialBillingService.applyAdjustment({
    organizationId: text(form, "organizationId"), kind,
    amountCents: kind === "discount_percent" ? null : cents(form, "amount"),
    percentage: kind === "discount_percent" && Number.isFinite(percentageValue) ? percentageValue : null,
    startsAt: iso(form, "startsAt"), endsAt: iso(form, "endsAt"),
    reason: text(form, "reason"), protocol: text(form, "protocol"),
  });
  refresh();
}

export async function cancelSubscriptionAdjustmentAction(form: FormData) {
  await PlatformCommercialBillingService.cancelAdjustment({
    adjustmentId: text(form, "adjustmentId"), reason: text(form, "reason"), protocol: text(form, "protocol"),
  });
  refresh();
}

export async function saveSubscriptionInvoiceAction(form: FormData) {
  const reference = text(form, "referenceMonth");
  await PlatformCommercialBillingService.saveInvoice({
    ...common(form),
    referenceMonth: /^\d{4}-\d{2}$/.test(reference) ? `${reference}-01` : reference,
    baseAmountCents: cents(form, "baseAmount"), discountAmountCents: Math.max(0, cents(form, "discountAmount")),
    dueAt: iso(form, "dueAt"),
    status: text(form, "invoiceStatus") as "pending" | "paid" | "overdue" | "cancelled" | "waived",
  });
  refresh();
}

export async function recordSubscriptionPaymentAction(form: FormData) {
  await PlatformCommercialBillingService.recordPayment({
    invoiceId: text(form, "invoiceId"), amountCents: cents(form, "amount"),
    method: text(form, "method") as "manual" | "pix" | "boleto" | "card",
    status: text(form, "paymentRecordStatus") as "pending" | "paid" | "failed" | "refunded" | "cancelled",
    reason: text(form, "reason"), protocol: text(form, "protocol"), idempotencyKey: text(form, "idempotencyKey"),
  });
  refresh();
}

export async function setSubscriptionAccessAction(form: FormData) {
  await PlatformCommercialBillingService.setAccess({
    organizationId: text(form, "organizationId"), suspended: text(form, "suspended") === "true",
    reason: text(form, "reason"), protocol: text(form, "protocol"),
  });
  refresh();
}

export async function assignFounderPlanAction(form: FormData) {
  await PlatformCommercialBillingService.assignFounder({
    organizationId: text(form, "organizationId"), reason: text(form, "reason"), protocol: text(form, "protocol"),
  });
  refresh();
}

export async function createSubscriptionChangeQuoteAction(form: FormData) {
  const featurePrice = optional(form, "featurePrice");
  await PlatformCommercialBillingService.createChangeQuote({
    organizationId: text(form, "organizationId"),
    changeType: text(form, "changeType") as "add_on" | "remove_addon" | "upgrade" | "downgrade",
    targetPlanId: optional(form, "targetPlanId"),
    featureId: optional(form, "featureId"),
    featurePriceCents: featurePrice === null ? null : cents(form, "featurePrice"),
    effectiveAt: iso(form, "effectiveAt"),
    reason: text(form, "reason"),
    protocol: text(form, "protocol"),
  });
  refresh();
}

export async function acceptSubscriptionChangeAction(form: FormData) {
  const input = { changeId: text(form, "changeId"), reason: text(form, "reason"), protocol: text(form, "protocol") };
  if (await PlatformModuleRequestService.isClientModuleRequest(input.changeId)) {
    await PlatformModuleRequestService.approve(input);
  } else {
    await PlatformCommercialBillingService.acceptChange(input);
  }
  refresh();
}

export async function rejectSubscriptionChangeAction(form: FormData) {
  await PlatformModuleRequestService.reject({
    changeId: text(form, "changeId"),
    reason: text(form, "reason"),
    protocol: text(form, "protocol"),
  });
  refresh();
}

export async function applyScheduledSubscriptionChangeAction(form: FormData) {
  await PlatformCommercialBillingService.applyScheduledChange({
    changeId: text(form, "changeId"), reason: text(form, "reason"), protocol: text(form, "protocol"),
  });
  refresh();
}
