"use server";

import { revalidatePath } from "next/cache";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";

export async function saveGuidedOperationalSetupAction(formData: FormData) {
  const current = await OperationalSettingsService.loadCurrent();
  const autoAccept = formData.get("acceptance") === "automatic";
  const simplified = formData.get("workflow") === "simplified";
  const requestedLevel = String(formData.get("deliveryLevel") ?? "manual");
  const deliveryOperationLevel = (["manual","dispatch_simple","driver_connected","advanced"] as const).find((level) => level === requestedLevel) ?? "manual";
  await OperationalSettingsService.saveCurrent({
    ...current.settings,
    ordersAutoAccept: simplified ? true : autoAccept,
    ordersWorkflowMode: simplified ? "simplified" : "standard",
    deliveryOperationLevel,
    deliveriesAutoCreateWhenReady: deliveryOperationLevel !== "manual",
    deliveriesDriverTrackingEnabled: deliveryOperationLevel === "advanced",
    deliveriesDriverSelfClaimEnabled: deliveryOperationLevel === "advanced",
  });
  revalidatePath("/configuracoes/operacao");
  revalidatePath("/operacao");
  revalidatePath("/pedidos");
}
