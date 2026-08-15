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
