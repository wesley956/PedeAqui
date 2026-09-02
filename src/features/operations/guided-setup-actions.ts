"use server";

import { revalidatePath } from "next/cache";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";

export async function saveGuidedOperationalSetupAction(formData: FormData) {
  const current = await OperationalSettingsService.loadCurrent();
  const autoAccept = formData.get("acceptance") === "automatic";
  const simplified = formData.get("workflow") === "simplified";
  await OperationalSettingsService.saveCurrent({
    ...current.settings,
    ordersAutoAccept: simplified ? true : autoAccept,
    ordersWorkflowMode: simplified ? "simplified" : "standard",
    deliveriesAutoCreateWhenReady: formData.get("deliveryHandoff") === "automatic",
  });
  revalidatePath("/configuracoes/operacao");
  revalidatePath("/operacao");
  revalidatePath("/pedidos");
}
