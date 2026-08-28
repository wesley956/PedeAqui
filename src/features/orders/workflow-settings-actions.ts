"use server";

import { revalidatePath } from "next/cache";
import {
  customWorkflowConfigSchema,
  selectedStagesFromForm,
  workflowModeSchema,
} from "@/features/orders/workflow-config";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";

export async function saveOrderWorkflowSettingsAction(formData: FormData) {
  const mode = workflowModeSchema.parse(String(formData.get("mode") ?? "standard"));
  const custom = customWorkflowConfigSchema.parse({
    delivery: selectedStagesFromForm(formData, "delivery"),
    pickup: selectedStagesFromForm(formData, "pickup"),
  });

  await OrderWorkflowSettingsService.save({ mode, custom });
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/fluxo-pedidos");
  revalidatePath("/pedidos");
}
