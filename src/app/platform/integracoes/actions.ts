"use server";

import { revalidatePath } from "next/cache";
import { PlatformOmnichannelSupportService } from "@/server/platform/platform-omnichannel-support-service";

export async function refreshOmnichannelHealthAction() {
  try {
    const result = await PlatformOmnichannelSupportService.refreshHealth();
    revalidatePath("/platform/integracoes");
    revalidatePath("/platform/incidentes");
    return { ok: true, ...result } as const;
  } catch {
    return { ok: false, error: "Não foi possível atualizar o health omnichannel agora." } as const;
  }
}

export async function reprocessIntegrationEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return;
  await PlatformOmnichannelSupportService.reprocessEvent(eventId);
  revalidatePath("/platform/integracoes");
}

export async function retryIntegrationOutboxAction(formData: FormData) {
  const outboxId = String(formData.get("outboxId") ?? "");
  if (!outboxId) return;
  await PlatformOmnichannelSupportService.retryOutbox(outboxId);
  revalidatePath("/platform/integracoes");
}

export async function reconcileExternalOrderAction(formData: FormData) {
  const externalOrderRowId = String(formData.get("externalOrderRowId") ?? "");
  if (!externalOrderRowId) return;
  await PlatformOmnichannelSupportService.reconcileOrder(externalOrderRowId);
  revalidatePath("/platform/integracoes");
}
