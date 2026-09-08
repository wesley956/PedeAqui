"use server";

import { revalidatePath } from "next/cache";
import { PlatformOmnichannelSupportService } from "@/server/platform/platform-omnichannel-support-service";

export async function refreshOmnichannelHealthAction(): Promise<void> {
  try {
    await PlatformOmnichannelSupportService.refreshHealth();
  } finally {
    revalidatePath("/platform/integracoes");
    revalidatePath("/platform/incidentes");
  }
}

export async function reprocessIntegrationEventAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return;
  await PlatformOmnichannelSupportService.reprocessEvent(eventId);
  revalidatePath("/platform/integracoes");
}

export async function retryIntegrationOutboxAction(formData: FormData): Promise<void> {
  const outboxId = String(formData.get("outboxId") ?? "");
  if (!outboxId) return;
  await PlatformOmnichannelSupportService.retryOutbox(outboxId);
  revalidatePath("/platform/integracoes");
}

export async function reconcileExternalOrderAction(formData: FormData): Promise<void> {
  const externalOrderRowId = String(formData.get("externalOrderRowId") ?? "");
  if (!externalOrderRowId) return;
  await PlatformOmnichannelSupportService.reconcileOrder(externalOrderRowId);
  revalidatePath("/platform/integracoes");
}
