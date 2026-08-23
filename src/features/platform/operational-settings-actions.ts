"use server";

import { revalidatePath } from "next/cache";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";

export async function saveOperationalSettingsAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const storeId = String(formData.get("storeId") ?? "");
  await OperationalSettingsService.savePlatform({
    organizationId,
    storeId,
    settings: {
      ordersAutoAccept: formData.get("ordersAutoAccept") === "on",
      ordersWorkflowMode: formData.get("ordersWorkflowMode") === "simplified" ? "simplified" : "standard",
      deliveriesAutoCreateWhenReady: formData.get("deliveriesAutoCreateWhenReady") === "on",
      deliveriesDriverTrackingEnabled: formData.get("deliveriesDriverTrackingEnabled") === "on",
      deliveriesStationaryAlertMinutes: Number(formData.get("deliveriesStationaryAlertMinutes") ?? 15),
      deliveriesTrackingRetentionDays: Number(formData.get("deliveriesTrackingRetentionDays") ?? 7),
      growthCampaignsEnabled: formData.get("growthCampaignsEnabled") === "on",
      campaignRatePerMinute: Number(formData.get("campaignRatePerMinute") ?? 10),
    },
    reason: String(formData.get("reason") ?? ""),
    requestId: String(formData.get("requestId") ?? ""),
  });
  revalidatePath(`/platform/empresas/${organizationId}/unidades/${storeId}`);
  revalidatePath(`/platform/unidades/${storeId}/configuracao-operacional`);
}
