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
    quickFinish: formData.get("quickFinish") === "on",
  });

  await OrderWorkflowSettingsService.save(
    { mode, custom },
    {
      source: "user_action",
      reason: "workflow_settings_form",
    },
  );
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/fluxo-pedidos");
  revalidatePath("/pedidos");
}
