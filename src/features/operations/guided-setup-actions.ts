"use server";

import { revalidatePath } from "next/cache";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";

export async function saveGuidedOperationalSetupAction(formData: FormData) {
  const current = await OperationalSettingsService.loadCurrent();
  const autoAccept = formData.get("acceptance") === "automatic";
  const requestedWorkflow = String(formData.get("workflow") ?? "standard");
  const workflow = (["standard", "simplified", "custom"] as const).find((item) => item === requestedWorkflow) ?? "standard";
  const simplified = workflow === "simplified";
  const requestedLevel = String(formData.get("deliveryLevel") ?? "manual");
  const deliveryOperationLevel = (["manual","dispatch_simple","driver_connected","advanced"] as const).find((level) => level === requestedLevel) ?? "manual";
  const requestedPaymentPolicy = String(formData.get("paymentPolicy") ?? "strict");
  const paymentCompletionPolicy = (["strict", "flexible", "quick_confirmation"] as const).find((policy) => policy === requestedPaymentPolicy) ?? "strict";
  await OperationalSettingsService.saveCurrent({
    ...current.settings,
    ordersAutoAccept: simplified ? true : autoAccept,
    ordersWorkflowMode: workflow,
    deliveryOperationLevel,
    paymentCompletionPolicy,
    deliveriesAutoCreateWhenReady: deliveryOperationLevel !== "manual",
    deliveriesDriverTrackingEnabled: deliveryOperationLevel === "advanced",
    deliveriesDriverSelfClaimEnabled: deliveryOperationLevel === "advanced",
  });
  revalidatePath("/configuracoes/operacao");
  revalidatePath("/operacao");
  revalidatePath("/pedidos");
}
