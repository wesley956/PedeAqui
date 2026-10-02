"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SubscriptionWhatsAppContactService } from "@/server/billing/subscription-whatsapp-contact-service";
import { SubscriptionWhatsAppDispatcher } from "@/server/billing/subscription-whatsapp-dispatcher";

function text(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveBillingWhatsAppContactAction(data: FormData) {
  const organizationId = z.string().uuid().parse(text(data, "organizationId"));
  const path = `/platform/empresas/${organizationId}`;
  let result = "saved";
  try {
    await SubscriptionWhatsAppContactService.save({
      organizationId,
      subscriptionId: text(data, "subscriptionId"),
      expectedUpdatedAt: text(data, "expectedUpdatedAt"),
      contact: { name: text(data, "name"), phone: text(data, "phone"), enabled: data.get("enabled") === "on", consentConfirmed: data.get("consentConfirmed") === "on" },
    });
    revalidatePath(path);
  } catch {
    result = "error";
  }
  redirect(`${path}?billingContact=${result}#billing-contact`);
}

export async function reprocessBillingWhatsAppAction(data: FormData) {
  const organizationId = z.string().uuid().parse(text(data, "organizationId"));
  const path = `/platform/empresas/${organizationId}`;
  let result = "queued";
  try {
    await SubscriptionWhatsAppDispatcher.reprocess({ organizationId, notificationId: text(data, "notificationId"), reason: text(data, "reason") });
    revalidatePath(path);
  } catch {
    result = "blocked";
  }
  redirect(`${path}?billingReplay=${result}#billing-deliveries`);
}
