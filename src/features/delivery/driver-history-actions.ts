"use server";

import { revalidatePath } from "next/cache";
import { DriverHistoryPolicyService } from "@/server/delivery/driver-history-policy-service";

export async function saveDriverHistoryVisibilityAction(formData: FormData) {
  await DriverHistoryPolicyService.set(formData.get("driverHistoryVisible") === "on");
  revalidatePath("/configuracoes/entrega");
  revalidatePath("/entregador");
}
